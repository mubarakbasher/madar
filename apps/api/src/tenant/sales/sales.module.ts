import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { QuotationsModule } from "../quotations/quotations.module";
import { SalesController } from "./sales.controller";
import { SalesService } from "./sales.service";

@Module({
  imports: [AuthModule, QuotationsModule],
  controllers: [SalesController],
  providers: [SalesService],
})
export class SalesModule {}
