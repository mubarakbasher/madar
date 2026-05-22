import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { HeldSalesController } from "./held-sales.controller";
import { HeldSalesService } from "./held-sales.service";

@Module({
  imports: [AuthModule],
  controllers: [HeldSalesController],
  providers: [HeldSalesService],
  exports: [HeldSalesService],
})
export class HeldSalesModule {}
