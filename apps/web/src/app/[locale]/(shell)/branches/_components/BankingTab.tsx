"use client";

import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import {
  listTenantBankAccounts,
  type TenantBankAccount,
} from "@/lib/api/tenant-bank-accounts";
import type { ApiBranchDetail } from "@/lib/api/branches";

export function BankingTab({ branch, locale }: { branch: ApiBranchDetail; locale: string }) {
  const t = useTranslations("branches.detail.banking");

  const q = useQuery({
    queryKey: ["bank-accounts", "branch", branch.id],
    queryFn: () => listTenantBankAccounts({ branch_id: branch.id }),
    staleTime: 30_000,
  });

  const items: TenantBankAccount[] = q.data?.items ?? [];
  const branchOverrides = items.filter((a) => a.branch_id === branch.id);
  const chainDefaults = items.filter((a) => a.branch_id === null);

  return (
    <section className="br-section">
      <h3 className="br-section-title">{t("title")}</h3>
      <p className="br-section-sub">{t("subtitle")}</p>

      {branchOverrides.length === 0 ? (
        <p className="br-empty-line">{t("usesTenantDefault")}</p>
      ) : (
        <ul className="br-bank-list">
          {branchOverrides.map((a) => (
            <BankRow key={a.id} a={a} t={t} />
          ))}
        </ul>
      )}

      {chainDefaults.length > 0 && (
        <div style={{ marginBlockStart: 18 }}>
          <h4 className="br-section-title" style={{ fontSize: 13 }}>
            {/* fallback header to "Chain defaults" — reuse usesTenantDefault label as section divider */}
            {t("usesTenantDefault")}
          </h4>
          <ul className="br-bank-list">
            {chainDefaults.map((a) => (
              <BankRow key={a.id} a={a} t={t} />
            ))}
          </ul>
        </div>
      )}

      <div style={{ marginBlockStart: 14, fontSize: 12, color: "var(--ink-3)" }}>
        <a href={`/${locale}/settings/bank-accounts`} className="br-link">
          {t("manageGlobal")}
        </a>
      </div>
    </section>
  );
}

function BankRow({
  a,
  t,
}: {
  a: TenantBankAccount;
  t: ReturnType<typeof useTranslations<"branches.detail.banking">>;
}) {
  return (
    <li className="br-bank-row">
      <div className="br-bank-row-info">
        <div className="br-bank-name">{a.bank_name}</div>
        <div className="br-bank-meta">
          {a.account_holder} · {t("currency")} {a.currency_code}
          {a.iban_last4 ? ` · ${t("iban")} •••• ${a.iban_last4}` : ""}
          {a.swift ? ` · ${t("swift")} ${a.swift}` : ""}
        </div>
      </div>
      <div className="br-bank-pills">
        {a.is_default && <span className="br-pill br-pill-default">{t("defaultPill")}</span>}
        {!a.is_active && <span className="br-pill br-pill-inactive">{t("inactivePill")}</span>}
      </div>
    </li>
  );
}
