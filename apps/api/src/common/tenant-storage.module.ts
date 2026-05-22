import { Global, Module } from "@nestjs/common";
import { StorageModule } from "./storage/storage.module";
import { VirusScanModule } from "./virus-scan/virus-scan.module";
import { TenantStorageService } from "./tenant-storage.service";

/**
 * Provides the canonical tenant-aware upload pipeline (path layout +
 * scanner + storage). Imported wherever a module needs to accept tenant
 * file uploads — payment-proofs, supplier-documents, future modules.
 *
 * `@Global()` so feature modules don't need to re-import the dependency
 * graph (storage + scanner are already global; this aligns).
 */
@Global()
@Module({
  imports: [StorageModule, VirusScanModule],
  providers: [TenantStorageService],
  exports: [TenantStorageService],
})
export class TenantStorageModule {}
