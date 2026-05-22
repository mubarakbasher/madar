import { Injectable, Logger } from "@nestjs/common";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { loadEnv } from "../../env";
import type { StorageService } from "./storage.service";

/**
 * S3-backed storage — works against real AWS S3 and MinIO (set
 * S3_FORCE_PATH_STYLE=true for MinIO). Bucket is created lazily on the first
 * put() so dev can spin up MinIO and not need a separate init step.
 */
@Injectable()
export class S3Storage implements StorageService {
  private readonly logger = new Logger(S3Storage.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private bucketEnsured = false;

  constructor() {
    const env = loadEnv();
    this.bucket = env.S3_BUCKET;
    this.client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      credentials:
        env.S3_ACCESS_KEY && env.S3_SECRET_KEY
          ? { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY }
          : undefined,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
    });
  }

  async put(key: string, buffer: Buffer): Promise<void> {
    await this.ensureBucket();
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: buffer }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!res.Body) {
      throw new Error(`Empty body for S3 object ${key}`);
    }
    const chunks: Buffer[] = [];
    for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (e) {
      const status = (e as { $metadata?: { httpStatusCode?: number } } | undefined)?.$metadata
        ?.httpStatusCode;
      if (status === 404) return false;
      throw e;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  private async ensureBucket(): Promise<void> {
    if (this.bucketEnsured) return;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (e) {
      const status = (e as { $metadata?: { httpStatusCode?: number } } | undefined)?.$metadata
        ?.httpStatusCode;
      if (status === 404 || status === 301 || !status) {
        this.logger.log(`Creating bucket ${this.bucket}`);
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      } else {
        throw e;
      }
    }
    this.bucketEnsured = true;
  }
}
