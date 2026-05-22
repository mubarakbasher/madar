import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from "@nestjs/common";
import { fromBuffer as fileTypeFromBuffer } from "file-type";
import {
  STORAGE_SERVICE,
  type StorageService,
} from "./storage/storage.service";
import {
  VIRUS_SCAN_SERVICE,
  type VirusScanService,
} from "./virus-scan/virus-scan.service";

/**
 * Shared upload pipeline for tenant-scoped file storage.
 *
 * Encodes the canonical CLAUDE.md path layout:
 *
 *     tenants/{tenant_id}/{prefix}/{file_id}.{ext}
 *
 * and wraps the put/sign/delete + ClamAV-scan pipeline so every module that
 * accepts tenant uploads (payment-proofs receipts, supplier documents, etc.)
 * uses the *identical* S3/MinIO + scanner code path.
 *
 * Scope-clean: this service does NOT preprocess (resize / EXIF-strip / re-encode).
 * Callers that need preprocessing run it on the buffer first and pass the
 * resulting bytes + final ext to putTenantObject. Receipts are images-only and
 * benefit from preprocessing; supplier documents include PDFs and shouldn't
 * be re-encoded.
 */

export type AllowedMime = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

export interface PutTenantObjectInput {
  tenantId: string;
  /**
   * Logical sub-prefix under `tenants/{tenant_id}/`. Examples:
   *   - "payment-proofs"
   *   - `suppliers/${supplierId}/documents`
   * Must not start or end with a slash.
   */
  prefix: string;
  /** Stable id for the file — typically the row's UUID. */
  fileId: string;
  /** Extension without leading dot, lowercase. e.g. "jpg" | "png" | "pdf". */
  ext: string;
  /** Declared MIME from multer / client. Used for sanity checks; not trusted. */
  contentType: string;
  /** Bytes to upload (already preprocessed if applicable). */
  buffer: Buffer;
}

export interface PutTenantObjectResult {
  key: string;
  sizeBytes: number;
}

export interface PutTenantObjectOptions {
  /**
   * MIME allowlist for THIS caller. Detected via magic bytes — declared MIME
   * is not trusted. Defaults to jpg/png/pdf (the payment-proofs allowlist).
   */
  allowedMimes?: ReadonlyArray<AllowedMime>;
  /**
   * Maximum allowed size in bytes. Defaults to TENANT_STORAGE_MAX_BYTES env
   * var or 5 MB. Multer enforces this earlier in the request lifecycle; this
   * is defense in depth.
   */
  maxBytes?: number;
  /**
   * If set, skip magic-byte MIME detection and trust the caller. Used by
   * niche callers (server-generated PDFs, etc.). Default: false.
   */
  skipMimeDetection?: boolean;
}

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_ALLOWED_MIMES: ReadonlyArray<AllowedMime> = [
  "image/jpeg",
  "image/png",
  "application/pdf",
];
const DEFAULT_TTL_SECONDS = 300;

function readMaxBytesFromEnv(): number {
  const raw = process.env.TENANT_STORAGE_MAX_BYTES;
  if (!raw) return DEFAULT_MAX_BYTES;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_BYTES;
}

@Injectable()
export class TenantStorageService {
  private readonly logger = new Logger(TenantStorageService.name);

  constructor(
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    @Inject(VIRUS_SCAN_SERVICE) private readonly scanner: VirusScanService,
  ) {}

  /**
   * Validates, scans, and stores an uploaded buffer under
   * `tenants/{tenant_id}/{prefix}/{file_id}.{ext}`.
   *
   * Throws:
   *   - 400 file_too_large       — buffer exceeds max bytes
   *   - 400 file_mime_unsupported — detected MIME not in allowlist
   *   - 422 file_infected        — ClamAV reports unclean
   */
  async putTenantObject(
    input: PutTenantObjectInput,
    options: PutTenantObjectOptions = {},
  ): Promise<PutTenantObjectResult> {
    const max = options.maxBytes ?? readMaxBytesFromEnv();
    if (input.buffer.length > max) {
      throw new BadRequestException({
        code: "file_too_large",
        message: `File must be ${Math.floor(max / 1024 / 1024)}MB or smaller`,
      });
    }

    if (!options.skipMimeDetection) {
      const detected = await fileTypeFromBuffer(input.buffer);
      const detectedMime = (detected?.mime ?? "") as AllowedMime;
      const allow = options.allowedMimes ?? DEFAULT_ALLOWED_MIMES;
      if (!allow.includes(detectedMime)) {
        throw new BadRequestException({
          code: "file_mime_unsupported",
          message: `File MIME ${detectedMime || "unknown"} is not allowed`,
        });
      }
    }

    const scanResult = await this.scanner.scan(input.buffer);
    if (!scanResult.clean) {
      throw new UnprocessableEntityException({
        code: "file_infected",
        message: "File failed virus scan",
        signature: scanResult.signature ?? undefined,
      });
    }

    const key = this.buildKey(input.tenantId, input.prefix, input.fileId, input.ext);
    await this.storage.put(key, input.buffer);

    return { key, sizeBytes: input.buffer.length };
  }

  /**
   * Returns a short-lived URL the client can use to fetch the object. For the
   * local-disk dev provider this is a relative storage key — controllers stream
   * the bytes themselves. For S3/MinIO this will produce a presigned URL once
   * the storage layer is upgraded; for now it falls back to the key as well so
   * callers have a stable contract.
   *
   * The TTL is advisory — callers should not exceed `ttlSeconds` for cache
   * lifetimes. Defaults to TENANT_STORAGE_URL_TTL env var or 5 minutes.
   */
  async signedUrl(key: string, ttlSeconds?: number): Promise<string> {
    const ttl = ttlSeconds ?? this.readTtlFromEnv();
    const maybeSigner = this.storage as StorageService & {
      signedUrl?: (k: string, ttlSeconds: number) => Promise<string>;
    };
    if (typeof maybeSigner.signedUrl === "function") {
      return maybeSigner.signedUrl(key, ttl);
    }
    // Fallback for local-disk: hand back the key. Controllers stream via
    // tenantStorage.getObject(key) (see helper below) when they need bytes.
    return key;
  }

  /**
   * Fetches the bytes for a stored object. Used by streaming controllers that
   * want to proxy the file through the API (auth-checked) instead of redirecting
   * to a signed URL.
   */
  async getObject(key: string): Promise<Buffer> {
    return this.storage.get(key);
  }

  /**
   * Deletes an object. Idempotent: missing objects do NOT throw.
   */
  async deleteObject(key: string): Promise<void> {
    try {
      const exists = await this.storage.exists(key);
      if (!exists) return;
      await this.storage.delete(key);
    } catch (e) {
      // S3 may return 404 for HeadObject — already handled in S3Storage.exists.
      // Anything else is a real error.
      this.logger.warn(`deleteObject(${key}) failed: ${(e as Error).message}`);
      throw e;
    }
  }

  /**
   * Internal — exposed only for tests / specialized callers that need to know
   * the canonical key shape for fixtures.
   */
  buildKey(tenantId: string, prefix: string, fileId: string, ext: string): string {
    if (!tenantId) throw new Error("tenantId is required");
    if (!fileId) throw new Error("fileId is required");
    if (!ext) throw new Error("ext is required");
    const cleanPrefix = prefix.replace(/^\/+|\/+$/g, "");
    if (!cleanPrefix) throw new Error("prefix is required");
    const cleanExt = ext.replace(/^\.+/, "").toLowerCase();
    return `tenants/${tenantId}/${cleanPrefix}/${fileId}.${cleanExt}`;
  }

  private readTtlFromEnv(): number {
    const raw = process.env.TENANT_STORAGE_URL_TTL;
    if (!raw) return DEFAULT_TTL_SECONDS;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_TTL_SECONDS;
  }
}
