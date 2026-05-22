import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { SupplierReturnsController } from "./supplier-returns.controller";
import { SupplierReturnsService } from "./supplier-returns.service";

/**
 * Tenant-side supplier-returns (RMA) module.
 *
 * Simpler than `purchase-orders` — no PDF/email queue, and the state machine
 * has no receive step. Inventory commits at `draft → sent` as one
 * `stock_movements` row per line with `kind='adjustment'` and
 * `reference_table='supplier_returns'` (the reference_table disambiguates
 * from a manual adjustment in the ledger; per the Phase 2.3 plan we do not
 * add a new enum value).
 */
@Module({
  imports: [AuthModule],
  controllers: [SupplierReturnsController],
  providers: [SupplierReturnsService],
  exports: [SupplierReturnsService],
})
export class SupplierReturnsModule {}
