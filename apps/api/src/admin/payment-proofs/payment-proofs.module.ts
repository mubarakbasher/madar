import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../auth/admin-auth.module";
import { PaymentProofsSharedModule } from "../../payment-proofs-shared/payment-proofs.module";
import { AdminPaymentProofsController } from "./payment-proofs.controller";

@Module({
  imports: [AdminAuthModule, PaymentProofsSharedModule],
  controllers: [AdminPaymentProofsController],
})
export class AdminPaymentProofsModule {}
