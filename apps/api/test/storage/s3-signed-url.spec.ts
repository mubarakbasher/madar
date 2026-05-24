import { describe, it, expect, vi, beforeAll } from "vitest";
import { GetObjectCommand } from "@aws-sdk/client-s3";

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn().mockResolvedValue("https://minio:9000/test-bucket/tenants/abc/proof.jpg?X-Amz-Signature=abc123"),
}));

// Must import AFTER vi.mock so the mock is in place when the module loads.
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { S3Storage } from "../../src/common/storage/s3.storage";
import { resetEnvCache } from "../../src/env";

describe("S3Storage.signedUrl", () => {
  let storage: S3Storage;

  beforeAll(() => {
    process.env.S3_ENDPOINT = "http://localhost:9000";
    process.env.S3_BUCKET = "test-bucket";
    process.env.S3_ACCESS_KEY = "test";
    process.env.S3_SECRET_KEY = "test";
    process.env.S3_FORCE_PATH_STYLE = "true";
    process.env.STORAGE_PROVIDER = "s3";
    resetEnvCache();

    storage = new S3Storage();
  });

  it("calls getSignedUrl with the correct GetObjectCommand and returns the presigned URL", async () => {
    const url = await storage.signedUrl("tenants/abc/proof.jpg", 300);

    expect(getSignedUrl).toHaveBeenCalledTimes(1);

    const [client, command, options] = (getSignedUrl as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(client).toBeDefined();
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect(command.input).toEqual({ Bucket: "test-bucket", Key: "tenants/abc/proof.jpg" });
    expect(options).toEqual({ expiresIn: 300 });

    expect(url).toBe("https://minio:9000/test-bucket/tenants/abc/proof.jpg?X-Amz-Signature=abc123");
  });
});
