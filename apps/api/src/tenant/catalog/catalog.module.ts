import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CatalogController } from "./catalog.controller";
import { CatalogService } from "./catalog.service";
import { CsvImportService } from "./csv-import.service";

@Module({
  imports: [AuthModule],
  controllers: [CatalogController],
  providers: [CatalogService, CsvImportService],
})
export class CatalogModule {}
