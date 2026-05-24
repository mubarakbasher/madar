import { Module } from "@nestjs/common";
import { AdminAuditModule } from "./audit/audit.module";
import { AdminAuthModule } from "./auth/admin-auth.module";
import { BillingTrackerModule } from "./billing-tracker/billing-tracker.module";
import { AdminCronModule } from "./cron/cron.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { AdminImpersonationModule } from "./impersonation/impersonation.module";
import { AdminInvoicesModule } from "./invoices/invoices.module";
import { AdminPaymentProofsModule } from "./payment-proofs/payment-proofs.module";
import { BankAccountsModule } from "./bank-accounts/bank-accounts.module";
import { PlansModule } from "./plans/plans.module";
import { TeamModule } from "./team/team.module";
import { TenantsModule } from "./tenants/tenants.module";

@Module({
  imports: [
    AdminAuthModule,
    DashboardModule,
    TenantsModule,
    PlansModule,
    AdminPaymentProofsModule,
    AdminImpersonationModule,
    AdminInvoicesModule,
    AdminAuditModule,
    BillingTrackerModule,
    BankAccountsModule,
    TeamModule,
    AdminCronModule.forRoot(),
  ],
})
export class AdminModule {}
