import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ReceivablesController } from "./receivables.controller";
import { ReceivablesService } from "./receivables.service";

@Module({
  imports: [AuthModule],
  controllers: [ReceivablesController],
  providers: [ReceivablesService],
  exports: [ReceivablesService],
})
export class ReceivablesModule {}
