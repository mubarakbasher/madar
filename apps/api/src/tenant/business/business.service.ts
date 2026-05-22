import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { fromBuffer as fileTypeFromBuffer } from "file-type";
// Tenant is a platform table; tenant-side self-service reads + writes the
// caller's own row only — isolation is enforced by passing the JWT's
// tenantId into every query.
// eslint-disable-next-line no-restricted-imports
import { adminPrisma } from "@madar/db";
import { AuditService } from "../auth/audit.service";
import { ImageProcessor, type SupportedMime } from "../../common/image/image-processor.service";
import { STORAGE_SERVICE, type StorageService } from "../../common/storage/storage.service";
import { VIRUS_SCAN_SERVICE, type VirusScanService } from "../../common/virus-scan/virus-scan.service";
import type { UpdateBusinessInput } from "./dto/update-business.dto";

const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const ALLOWED_LOGO_MIMES: SupportedMime[] = ["image/jpeg", "image/png", "image/webp"];

export interface BusinessSnapshot {
  id: string;
  slug: string;
  name: string;
  name_i18n: { en: string; ar: string };
  country_code: string;
  legal_name: string | null;
  business_type: string | null;
  default_currency_code: string;
  timezone: string;
  fiscal_year_start_month: number;
  tax_registration_number: string | null;
  tax_inclusive_default: boolean;
  default_locale: string;
  default_tax_class_id: string | null;
  logo_url: string | null;
  status: string;
  trial_ends_at: string | null;
  plan: { code: string; name_i18n: unknown } | null;
}

interface AuditCtx {
  tenantId: string;
  userId: string;
  ip: string;
  userAgent: string;
  impersonatorId?: string;
}

@Injectable()
export class BusinessService {
  private readonly logger = new Logger(BusinessService.name);

  constructor(
    private readonly audit: AuditService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    @Inject(VIRUS_SCAN_SERVICE) private readonly scanner: VirusScanService,
    private readonly imageProcessor: ImageProcessor,
  ) {}

  async get(tenantId: string): Promise<BusinessSnapshot> {
    const tenant = await adminPrisma.tenant.findUnique({
      where: { id: tenantId },
      include: { plan: true },
    });
    if (!tenant) {
      throw new NotFoundException({
        code: "tenant_not_found",
        message: "Tenant not found",
      });
    }
    return this.toSnapshot(tenant);
  }

  async update(
    tenantId: string,
    role: string,
    input: UpdateBusinessInput,
    ctx: AuditCtx,
  ): Promise<BusinessSnapshot> {
    if (role !== "owner") {
      throw new ForbiddenException({
        code: "forbidden_role",
        message: "Only the owner can edit business settings",
      });
    }

    const before = await adminPrisma.tenant.findUnique({
      where: { id: tenantId },
      include: { plan: true },
    });
    if (!before) {
      throw new NotFoundException({
        code: "tenant_not_found",
        message: "Tenant not found",
      });
    }

    // Authoritative timezone validation via Intl — the DTO accepts any string,
    // but only IANA-recognized zones survive here.
    if (input.timezone !== undefined) {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: input.timezone });
      } catch {
        throw new BadRequestException({
          code: "invalid_timezone",
          message: `Timezone "${input.timezone}" is not recognized`,
        });
      }
    }

    // Build the changed-fields delta + the corresponding before/after audit
    // snapshots. Only fields that actually changed get written or audited.
    const data: Record<string, unknown> = {};
    const beforeDiff: Record<string, unknown> = {};
    const afterDiff: Record<string, unknown> = {};

    const tryDiff = <K extends keyof BusinessSnapshot>(
      key: K,
      incoming: unknown,
      currentValue: BusinessSnapshot[K],
      writeKey?: string,
    ): void => {
      if (incoming === undefined) return;
      if (incoming === currentValue) return;
      data[writeKey ?? (key as string)] = incoming;
      beforeDiff[key as string] = currentValue;
      afterDiff[key as string] = incoming;
    };

    const beforeSnap = this.toSnapshot(before);

    tryDiff("name", input.name, beforeSnap.name);
    if (input.name_i18n !== undefined) {
      const incoming = input.name_i18n;
      if (
        incoming.en !== beforeSnap.name_i18n.en ||
        incoming.ar !== beforeSnap.name_i18n.ar
      ) {
        data.name_i18n = incoming;
        beforeDiff.name_i18n = beforeSnap.name_i18n;
        afterDiff.name_i18n = incoming;
      }
    }
    tryDiff("legal_name", input.legal_name, beforeSnap.legal_name);
    tryDiff("business_type", input.business_type, beforeSnap.business_type);
    tryDiff(
      "default_currency_code",
      input.default_currency_code,
      beforeSnap.default_currency_code,
    );
    tryDiff("timezone", input.timezone, beforeSnap.timezone);
    tryDiff(
      "fiscal_year_start_month",
      input.fiscal_year_start_month,
      beforeSnap.fiscal_year_start_month,
    );
    tryDiff(
      "tax_registration_number",
      input.tax_registration_number,
      beforeSnap.tax_registration_number,
    );
    tryDiff(
      "tax_inclusive_default",
      input.tax_inclusive_default,
      beforeSnap.tax_inclusive_default,
    );
    tryDiff("default_locale", input.default_locale, beforeSnap.default_locale);

    if (Object.keys(data).length === 0) {
      // Nothing to change — return the snapshot as-is without an audit row.
      return beforeSnap;
    }

    const updated = await adminPrisma.tenant.update({
      where: { id: tenantId },
      data,
      include: { plan: true },
    });

    await this.audit
      .writeTenantScoped(
        {
          tenantId,
          userId: ctx.userId,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
          ...(ctx.impersonatorId ? { impersonatorId: ctx.impersonatorId } : {}),
        },
        {
          action: "tenant_updated",
          entity: "tenant",
          entityId: tenantId,
          before: beforeDiff,
          after: afterDiff,
        },
      )
      .catch((e) =>
        this.logger.warn(`audit write failed: ${(e as Error).message}`),
      );

    return this.toSnapshot(updated);
  }

  // ─── logo upload (Slice 4 — PAGES §48) ─────────────────────────────

  async setLogo(
    tenantId: string,
    role: string,
    actorId: string,
    file: { buffer: Buffer; declaredMime: string; originalName: string },
    ctx: AuditCtx,
  ): Promise<BusinessSnapshot> {
    if (role !== "owner") {
      throw new ForbiddenException({
        code: "forbidden_role",
        message: "Only the owner can change the logo",
      });
    }
    if (file.buffer.length > MAX_LOGO_BYTES) {
      throw new BadRequestException({
        code: "file_too_large",
        message: "Logo must be 5MB or smaller",
      });
    }
    const detected = await fileTypeFromBuffer(file.buffer);
    const detectedMime = detected?.mime ?? "";
    if (!ALLOWED_LOGO_MIMES.includes(detectedMime as SupportedMime)) {
      throw new BadRequestException({
        code: "file_mime_unsupported",
        message: "Logo must be JPG, PNG, or WEBP",
      });
    }
    const mime = detectedMime as SupportedMime;

    const before = await adminPrisma.tenant.findUnique({
      where: { id: tenantId },
      include: { plan: true },
    });
    if (!before) {
      throw new NotFoundException({ code: "tenant_not_found", message: "Tenant not found" });
    }

    const scan = await this.scanner.scan(file.buffer);
    if (!scan.clean) {
      throw new UnprocessableEntityException({
        code: "file_infected",
        message: "Logo failed virus scan",
      });
    }

    const processed = await this.imageProcessor.process(file.buffer, mime);
    const relPath = `tenants/${tenantId}/branding/logo.${processed.ext}`;
    await this.storage.put(relPath, processed.buffer);

    // Drop the prior asset if its extension differs (same-ext re-uploads
    // overwrite by deterministic key).
    if (before.logo_url && before.logo_url !== relPath) {
      void this.storage
        .delete(before.logo_url)
        .catch((e) => this.logger.warn(`stale logo delete failed: ${(e as Error).message}`));
    }

    const updated = await adminPrisma.tenant.update({
      where: { id: tenantId },
      data: { logo_url: relPath },
      include: { plan: true },
    });

    await this.audit
      .writeTenantScoped(
        {
          tenantId,
          userId: actorId,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
          ...(ctx.impersonatorId ? { impersonatorId: ctx.impersonatorId } : {}),
        },
        {
          action: "tenant_logo_set",
          entity: "tenant",
          entityId: tenantId,
          before: { logo_url: before.logo_url ?? null },
          after: { logo_url: relPath, mime: processed.mime },
        },
      )
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return this.toSnapshot(updated);
  }

  async clearLogo(
    tenantId: string,
    role: string,
    actorId: string,
    ctx: AuditCtx,
  ): Promise<BusinessSnapshot> {
    if (role !== "owner") {
      throw new ForbiddenException({
        code: "forbidden_role",
        message: "Only the owner can change the logo",
      });
    }
    const before = await adminPrisma.tenant.findUnique({
      where: { id: tenantId },
      include: { plan: true },
    });
    if (!before) {
      throw new NotFoundException({ code: "tenant_not_found", message: "Tenant not found" });
    }
    if (!before.logo_url) return this.toSnapshot(before);

    const oldPath = before.logo_url;
    const updated = await adminPrisma.tenant.update({
      where: { id: tenantId },
      data: { logo_url: null },
      include: { plan: true },
    });
    void this.storage
      .delete(oldPath)
      .catch((e) => this.logger.warn(`logo delete failed: ${(e as Error).message}`));

    await this.audit
      .writeTenantScoped(
        {
          tenantId,
          userId: actorId,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
          ...(ctx.impersonatorId ? { impersonatorId: ctx.impersonatorId } : {}),
        },
        {
          action: "tenant_logo_cleared",
          entity: "tenant",
          entityId: tenantId,
          before: { logo_url: oldPath },
        },
      )
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return this.toSnapshot(updated);
  }

  async streamLogo(
    tenantId: string,
  ): Promise<{ buffer: Buffer; mime: string; filename: string }> {
    const tenant = await adminPrisma.tenant.findUnique({
      where: { id: tenantId },
      select: { logo_url: true },
    });
    if (!tenant || !tenant.logo_url) {
      throw new NotFoundException({ code: "logo_not_found", message: "No logo set" });
    }
    const buffer = await this.storage.get(tenant.logo_url);
    if (!buffer) {
      throw new NotFoundException({ code: "logo_not_found", message: "Logo file missing" });
    }
    const ext = tenant.logo_url.split(".").pop() ?? "jpg";
    const mime =
      ext === "png"
        ? "image/png"
        : ext === "webp"
          ? "image/webp"
          : "image/jpeg";
    return { buffer, mime, filename: `logo.${ext}` };
  }

  private toSnapshot(t: {
    id: string;
    slug: string;
    name: string;
    name_i18n: unknown;
    country_code: string;
    legal_name: string | null;
    business_type: string | null;
    default_currency_code: string;
    timezone: string;
    fiscal_year_start_month: number;
    tax_registration_number: string | null;
    tax_inclusive_default: boolean;
    default_locale: string;
    default_tax_class_id: string | null;
    logo_url: string | null;
    status: string;
    trial_ends_at: Date | null;
    plan: { code: string; name_i18n: unknown } | null;
  }): BusinessSnapshot {
    const i18n = (t.name_i18n as { en?: string; ar?: string } | null) ?? null;
    return {
      id: t.id,
      slug: t.slug,
      name: t.name,
      name_i18n: { en: i18n?.en ?? t.name, ar: i18n?.ar ?? t.name },
      country_code: t.country_code,
      legal_name: t.legal_name,
      business_type: t.business_type,
      default_currency_code: t.default_currency_code,
      timezone: t.timezone,
      fiscal_year_start_month: t.fiscal_year_start_month,
      tax_registration_number: t.tax_registration_number,
      tax_inclusive_default: t.tax_inclusive_default,
      default_locale: t.default_locale,
      default_tax_class_id: t.default_tax_class_id,
      logo_url: t.logo_url,
      status: t.status,
      trial_ends_at: t.trial_ends_at?.toISOString() ?? null,
      plan: t.plan ? { code: t.plan.code, name_i18n: t.plan.name_i18n } : null,
    };
  }
}
