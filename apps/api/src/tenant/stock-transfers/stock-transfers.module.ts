import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { StockTransfersController } from "./stock-transfers.controller";
import { StockTransfersService } from "./stock-transfers.service";

@Module({
  imports: [AuthModule],
  controllers: [StockTransfersController],
  providers: [StockTransfersService],
  exports: [StockTransfersService],
})
export class StockTransfersModule {}
