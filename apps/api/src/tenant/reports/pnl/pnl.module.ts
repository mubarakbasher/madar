import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { PnlController } from "./pnl.controller";
import { PnlService } from "./pnl.service";

@Module({
  imports: [AuthModule],
  controllers: [PnlController],
  providers: [PnlService],
  exports: [PnlService],
})
export class PnlModule {}
