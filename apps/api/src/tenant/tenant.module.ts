import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { TenantBankAccountsModule } from "./bank-accounts/bank-accounts.module";
import { BillingModule } from "./billing/billing.module";
import { BusinessModule } from "./business/business.module";
import { BranchesModule } from "./branches/branches.module";
import { CatalogModule } from "./catalog/catalog.module";
import { CustomersModule } from "./customers/customers.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { HeldSalesModule } from "./held-sales/held-sales.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { OnboardingModule } from "./onboarding/onboarding.module";
import { TenantImpersonationModule } from "./impersonation/impersonation.module";
import { SaleRefundsModule } from "./sale-refunds/sale-refunds.module";
import { SalesModule } from "./sales/sales.module";
import { ShiftsModule } from "./shifts/shifts.module";
import { TenantPaymentProofsModule } from "./payment-proofs/payment-proofs.module";
import { PurchaseOrdersModule } from "./purchase-orders/purchase-orders.module";
import { ReconcileModule } from "./reconcile/reconcile.module";
import { ReorderModule } from "./reorder/reorder.module";
import { ReportsModule } from "./reports/reports.module";
import { StockModule } from "./stock/stock.module";
import { StockTransfersModule } from "./stock-transfers/stock-transfers.module";
import { StoreCreditModule } from "./store-credit/store-credit.module";
import { SupplierReturnsModule } from "./supplier-returns/supplier-returns.module";
import { SuppliersModule } from "./suppliers/suppliers.module";
import { SyncConflictsModule } from "./sync-conflicts/sync-conflicts.module";
import { TaxClassesModule } from "./tax-classes/tax-classes.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    AuthModule,
    CatalogModule,
    CustomersModule,
    SalesModule,
    SaleRefundsModule,
    TenantPaymentProofsModule,
    TenantBankAccountsModule,
    BranchesModule,
    DashboardModule,
    TenantImpersonationModule,
    BillingModule,
    BusinessModule,
    StockModule,
    ReorderModule,
    StockTransfersModule,
    StoreCreditModule,
    SuppliersModule,
    PurchaseOrdersModule,
    ReconcileModule,
    ReportsModule,
    SupplierReturnsModule,
    SyncConflictsModule,
    TaxClassesModule,
    HeldSalesModule,
    NotificationsModule,
    OnboardingModule,
    ShiftsModule,
    UsersModule,
  ],
})
export class TenantModule {}
