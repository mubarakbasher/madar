import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PurchaseOrdersController } from "./purchase-orders.controller";
import { PurchaseOrdersService } from "./purchase-orders.service";
import { SendPoEmailModule } from "./jobs/send-po-email.module";

/**
 * Tenant-side purchase-orders module.
 *
 * `SendPoEmailModule.forRoot()` is imported here (and only here) so the
 * `SendPoEmailQueue` is provided to the controller. The module degrades
 * gracefully when REDIS_URL is unset — see `send-po-email.module.ts` and
 * `send-po-email.queue.ts` for the inline-fallback contract.
 */
@Module({
  imports: [AuthModule, SendPoEmailModule.forRoot()],
  controllers: [PurchaseOrdersController],
  providers: [PurchaseOrdersService],
  exports: [PurchaseOrdersService],
})
export class PurchaseOrdersModule {}
