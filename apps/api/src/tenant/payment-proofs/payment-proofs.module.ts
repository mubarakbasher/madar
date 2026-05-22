import { Module } from "@nestjs/common";
import { PaymentProofsSharedModule } from "../../payment-proofs-shared/payment-proofs.module";
import { PaymentProofsController } from "./payment-proofs.controller";

@Module({
  imports: [PaymentProofsSharedModule],
  controllers: [PaymentProofsController],
})
export class TenantPaymentProofsModule {}
