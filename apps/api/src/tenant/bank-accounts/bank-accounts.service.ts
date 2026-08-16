import { Injectable } from "@nestjs/common";
import { tenantScoped } from "@madar/db";

export interface TenantBankAccountItem {
  id: string;
  /** Translatable label ("Main account" / "الحساب الرئيسي"). `bank_name` and
   *  `account_holder` are the institution's own strings and stay untranslated. */
  name_i18n: { en: string; ar: string };
  bank_name: string;
  account_holder: string;
  account_number_last4: string;
  iban_last4: string | null;
  swift: string | null;
  currency_code: string;
  branch_id: string | null;
  is_default: boolean;
  is_active: boolean;
}

@Injectable()
export class BankAccountsService {
  async listForTenant(
    tenantId: string,
    opts: { branch_id?: string } = {},
  ): Promise<{ items: TenantBankAccountItem[] }> {
    // If branch_id is passed, return the union of (chain-default rows, this branch's rows)
    // so the caller can render "uses tenant default" + any per-branch overrides.
    const where: Record<string, unknown> = { deleted_at: null };
    if (opts.branch_id) {
      where.OR = [{ branch_id: null }, { branch_id: opts.branch_id }];
    }

    const rows = await tenantScoped(tenantId).tenantBankAccount.findMany({
      where,
      orderBy: [
        { branch_id: "desc" },
        { is_default: "desc" },
        { created_at: "asc" },
      ],
      select: {
        id: true,
        name_i18n: true,
        bank_name: true,
        account_holder: true,
        account_number_last4: true,
        iban_last4: true,
        swift: true,
        currency_code: true,
        branch_id: true,
        is_default: true,
        is_active: true,
      },
    });
    // `name_i18n` is a non-null jsonb column that this endpoint never selected,
    // so an Arabic UI could only ever show the Latin bank_name. Shaped
    // defensively like reconcile.service.ts in case a row holds malformed json.
    return {
      items: rows.map((r) => {
        const n = (r.name_i18n ?? {}) as { en?: string; ar?: string };
        return {
          ...r,
          name_i18n: { en: n.en ?? r.bank_name, ar: n.ar ?? n.en ?? r.bank_name },
        };
      }),
    };
  }
}
