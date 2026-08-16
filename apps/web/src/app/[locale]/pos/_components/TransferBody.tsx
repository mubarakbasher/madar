"use client";

import { useQuery } from "@tanstack/react-query";
import { Landmark } from "lucide-react";
import { listTenantBankAccounts } from "@/lib/api/tenant-bank-accounts";
import { useFormat } from "@/lib/i18n/format";
import { useTranslations } from "next-intl";

/**
 * Compose-stage body for "Bank transfer".
 *
 * There was no `method === "tx"` branch here at all: picking Transfer rendered
 * an empty panel above a permanently disabled button, so the cashier had
 * nothing to read out to the customer and no way forward. This shows the
 * receiving account the sale will be matched against, which is what
 * docs/billing-flow.md expects the POS to surface.
 */
export function TransferBody({
  locale,
  branchId,
  totalCents,
  currency,
}: {
  locale: "en" | "ar";
  branchId: string | null;
  totalCents: string | number;
  currency: string;
}) {
  const t = useTranslations("pos.payment.transfer");
  const f = useFormat();

  const q = useQuery({
    queryKey: ["tenant-bank-accounts", branchId],
    queryFn: () => listTenantBankAccounts(branchId ? { branch_id: branchId } : {}),
    staleTime: 5 * 60_000,
  });

  // The API returns per-branch overrides ahead of chain defaults, so the first
  // active row is the one this branch's sales are matched against.
  const account = q.data?.items.find((a) => a.is_active) ?? null;

  const row = (label: string, value: string) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)" }}>
      <span style={{ color: "var(--ink-3)" }}>{label}</span>
      {/* dir="ltr" so an account number's digits don't get bidi-reordered. */}
      <span className="tnum" dir="ltr" style={{ fontFamily: "var(--mono)" }}>
        {value}
      </span>
    </div>
  );

  return (
    <div style={{ marginTop: "var(--space-3)" }}>
      <div
        style={{
          background: "var(--bg-sunk)",
          border: "1px solid var(--rule)",
          borderRadius: "var(--radius)",
          padding: "var(--space-3)",
          fontSize: 13,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {q.isPending && <div style={{ color: "var(--ink-3)" }}>{t("loading")}</div>}

        {!q.isPending && !account && (
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <Landmark size={15} strokeWidth={1.5} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 600 }}>{t("empty.title")}</div>
              <div style={{ color: "var(--ink-3)", marginTop: 2 }}>{t("empty.body")}</div>
            </div>
          </div>
        )}

        {account && (
          <>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <Landmark size={15} strokeWidth={1.5} style={{ flexShrink: 0 }} />
              <strong>{account.name_i18n[locale] || account.name_i18n.en}</strong>
            </div>
            {row(t("bank"), account.bank_name)}
            {row(t("holder"), account.account_holder)}
            {row(
              account.iban_last4 ? t("iban") : t("account"),
              `•••• ${account.iban_last4 ?? account.account_number_last4}`,
            )}
            {row(t("amount"), f.money(totalCents, currency))}
          </>
        )}
      </div>
      <p style={{ margin: "var(--space-2) 0 0", fontSize: 12, color: "var(--ink-3)" }}>
        {t("hint")}
      </p>
    </div>
  );
}
