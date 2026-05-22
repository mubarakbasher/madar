import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { StockController } from "./stock.controller";
import { StockService } from "./stock.service";

@Module({
  imports: [AuthModule],
  controllers: [StockController],
  providers: [StockService],
  exports: [StockService],
})
export class StockModule {}
