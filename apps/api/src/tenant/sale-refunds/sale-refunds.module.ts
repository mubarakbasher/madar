import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { SaleRefundsController } from "./sale-refunds.controller";
import { SaleRefundsService } from "./sale-refunds.service";

@Module({
  imports: [AuthModule],
  controllers: [SaleRefundsController],
  providers: [SaleRefundsService],
  exports: [SaleRefundsService],
})
export class SaleRefundsModule {}
