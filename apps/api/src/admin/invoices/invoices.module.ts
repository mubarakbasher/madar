import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../auth/admin-auth.module";
import { AdminInvoicesController } from "./invoices.controller";
import { AdminInvoicesService } from "./invoices.service";

@Module({
  imports: [AdminAuthModule],
  controllers: [AdminInvoicesController],
  providers: [AdminInvoicesService],
})
export class AdminInvoicesModule {}
