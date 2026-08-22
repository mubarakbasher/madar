"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Printer } from "lucide-react";
import { quotationDetailRequest, type ApiQuotationLine } from "@/lib/api/quotations";
import { businessGetRequest } from "@/lib/api/business";
import { branchesListRequest } from "@/lib/api/branches";
import { customerGetRequest } from "@/lib/api/customers";
import { listTenantBankAccounts } from "@/lib/api/tenant-bank-accounts";
import type { SaleLineResponse } from "@/lib/api/sales";
import { ReceiptView, type ReceiptViewDoc } from "../../_components/ReceiptView";
import "../../[id]/receipt/receipt.css";

type Size = "58mm" | "80mm" | "a4";
const SIZES: Size[] = ["58mm", "80mm", "a4"];

function toSaleLine(line: ApiQuotationLine, idx: number): SaleLineResponse {
  const unit = BigInt(line.unit_price_cents);
  const qtyInt = BigInt(Math.round(line.qty));
  const gross = unit * qtyInt;
  const discount = BigInt(line.discount_cents || "0");
  return {
    id: `${line.product_id}-${idx}`,
    product_id: line.product_id,
    sku: line.sku ?? "",
    name_i18n: line.name_i18n,
    qty: line.qty,
    unit_price_cents: line.unit_price_cents,
    discount_cents: line.discount_cents,
    tax_cents: "0",
    line_total_cents: (gross - discount).toString(),
    cogs_snapshot_cents: "0",
    note: line.note,
  };
}

export function QuotationPrintDoc({
  id,
  locale,
  size,
}: {
  id: string;
  locale: "en" | "ar";
  size: Size;
}) {
  const t = useTranslations("receipt");

  const quoteQ = useQuery({
    queryKey: ["quotations", "detail", id],
    queryFn: () => quotationDetailRequest(id),
  });
  const businessQ = useQuery({
    queryKey: ["business", "snapshot"],
    queryFn: () => businessGetRequest(),
  });
  const branchesQ = useQuery({
    queryKey: ["branches", "list-for-print"],
    queryFn: () => branchesListRequest(),
  });
  const customerId = quoteQ.data?.customer_id ?? null;
  const customerQ = useQuery({
    queryKey: ["customers", "detail", customerId],
    queryFn: () => customerGetRequest(customerId!),
    enabled: !!customerId,
  });
  const branchId = quoteQ.data?.branch_id;
  const bankQ = useQuery({
    queryKey: ["tenant-bank-accounts", branchId ?? "any"],
    queryFn: () => listTenantBankAccounts(branchId ? { branch_id: branchId } : {}),
    enabled: !!quoteQ.data,
  });

  const isLoading = quoteQ.isPending || businessQ.isPending || branchesQ.isPending;
  if (isLoading) {
    return (
      <div className="receipt-shell">
        <p style={{ color: "var(--ink-3)" }}>{t("loading")}</p>
      </div>
    );
  }
  if (quoteQ.isError || !quoteQ.data || businessQ.isError || !businessQ.data) {
    return (
      <div className="receipt-shell">
        <p style={{ color: "var(--rose)" }}>{t("errors.loadFailed")}</p>
      </div>
    );
  }

  const quote = quoteQ.data;
  const business = businessQ.data;
  const branch = (branchesQ.data?.items ?? []).find((b) => b.id === quote.branch_id) ?? null;
  const bankAccounts = bankQ.data?.items ?? [];
  const bankAccount =
    bankAccounts.find((a) => a.is_default && a.is_active) ??
    bankAccounts.find((a) => a.is_active) ??
    null;

  const doc: ReceiptViewDoc = {
    sale: {
      id: quote.id,
      code: quote.code,
      branch_id: quote.branch_id,
      cashier_id: quote.cashier_id,
      customer_id: quote.customer_id,
      occurred_at: quote.created_at,
      subtotal_cents: quote.subtotal_cents,
      discount_cents: quote.discount_cents,
      tax_cents: quote.tax_cents,
      total_cents: quote.total_cents,
      cash_tendered_cents: null,
      change_due_cents: null,
      currency_code: quote.currency_code,
      payment_method: "cash",
      payment_status: "unpaid",
      approval_code: null,
      client_uuid: quote.id,
      client_occurred_at: null,
      has_negative_stock: false,
      offline_completed: false,
      balance_due_cents: "0",
      lines: quote.lines.map(toSaleLine),
      payments: [],
    },
    tenant: {
      id: business.id,
      name: business.name,
      name_i18n: business.name_i18n,
      logo_url: business.logo_url,
      legal_name: business.legal_name,
      tax_registration_number: business.tax_registration_number,
    },
    branch: branch
      ? { code: branch.code, name_i18n: branch.name_i18n, address_i18n: branch.address_i18n }
      : null,
    cashier: null,
    customer: customerQ.data ? { name: customerQ.data.name } : null,
    bank_account: bankAccount
      ? {
          bank_name: bankAccount.bank_name,
          account_holder: bankAccount.account_holder,
          account_number_last4: bankAccount.account_number_last4,
          iban_last4: bankAccount.iban_last4,
          swift: bankAccount.swift,
        }
      : null,
    quotation: { code: quote.code, valid_until: quote.valid_until },
  };

  return (
    <div className="receipt-shell">
      <ReceiptView doc={doc} locale={locale} size={size} variant="quotation" />

      <div className="no-print">
        <a href={`/${locale}/sales/quotations/${id}`} className="receipt-back-link">
          {t("buttons.backToPos")}
        </a>
        <button type="button" onClick={() => window.print()}>
          <Printer size={14} strokeWidth={1.5} style={{ verticalAlign: "middle", marginInlineEnd: "var(--space-1)" }} />
          {t("buttons.print")}
        </button>
        {SIZES.filter((s) => s !== size).map((s) => (
          <a key={s} href={`?size=${s}`}>
            {s === "58mm"
              ? t("buttons.switch58")
              : s === "80mm"
                ? t("buttons.switch80")
                : t("buttons.switchA4")}
          </a>
        ))}
      </div>
    </div>
  );
}
