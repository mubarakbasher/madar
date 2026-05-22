import { Global, Module } from "@nestjs/common";
import { EmailModule } from "./email/email.module";
import { ImageModule } from "./image/image.module";
import { RedisService } from "./redis.service";
import { StorageModule } from "./storage/storage.module";
import { TenantStorageModule } from "./tenant-storage.module";
import { VirusScanModule } from "./virus-scan/virus-scan.module";

@Global()
@Module({
  imports: [StorageModule, VirusScanModule, ImageModule, EmailModule, TenantStorageModule],
  providers: [RedisService],
  exports: [
    RedisService,
    StorageModule,
    VirusScanModule,
    ImageModule,
    EmailModule,
    TenantStorageModule,
  ],
})
export class CommonModule {}
