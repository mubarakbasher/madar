import { Module } from "@nestjs/common";
import { AuthModule } from "../tenant/auth/auth.module";
import { AdminAuthModule } from "../admin/auth/admin-auth.module";
import { PaymentProofsService } from "./payment-proofs.service";

@Module({
  imports: [AuthModule, AdminAuthModule],
  providers: [PaymentProofsService],
  exports: [PaymentProofsService],
})
export class PaymentProofsSharedModule {}
