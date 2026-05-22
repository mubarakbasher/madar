import { Global, Module } from "@nestjs/common";
import { LocalDiskStorage } from "./local-disk.storage";
import { S3Storage } from "./s3.storage";
import { STORAGE_SERVICE } from "./storage.service";

/**
 * Storage provider is env-driven. STORAGE_PROVIDER=s3 selects MinIO/S3;
 * anything else (default) selects local-disk. Tests pin "local" in
 * apps/api/test/setup.ts so the S3 code path is exercised only by manual
 * smoke + production traffic.
 */
@Global()
@Module({
  providers: [
    LocalDiskStorage,
    S3Storage,
    {
      provide: STORAGE_SERVICE,
      useFactory: (local: LocalDiskStorage, s3: S3Storage) =>
        process.env.STORAGE_PROVIDER === "s3" ? s3 : local,
      inject: [LocalDiskStorage, S3Storage],
    },
  ],
  exports: [STORAGE_SERVICE, LocalDiskStorage, S3Storage],
})
export class StorageModule {}
