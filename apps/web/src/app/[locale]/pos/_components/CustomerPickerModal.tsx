"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Search, UserPlus, X } from "lucide-react";
import { customersListRequest, type ApiCustomerSummary } from "@/lib/api/customers";

export interface PosCustomerPick {
  id: string;
  name: string;
  storeCreditMinor: string;
  storeCreditCurrency: string | null;
  salesCount: number;
}

export function CustomerPickerModal({
  open,
  onClose,
  onPick,
  locale,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (c: PosCustomerPick) => void;
  locale: "en" | "ar";
}) {
  const t = useTranslations("pos.customerPicker");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const q = useQuery({
    queryKey: ["pos", "customer-picker", debounced],
    queryFn: () => customersListRequest({ search: debounced || undefined, limit: 50 }),
    enabled: open,
    staleTime: 30_000,
  });

  if (!open) return null;

  return (
    <div className="pos-modal-bg" onClick={onClose} role="dialog" aria-modal>
      <div
        className="pos-modal pos-customer-picker"
        style={{ width: 520, maxWidth: "calc(100vw - 32px)", padding: "18px 22px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pos-modal-head">
          <h3 className="serif" style={{ margin: 0 }}>{t("title")}</h3>
          <button type="button" className="pos-link" onClick={onClose} aria-label={t("close")}>
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <div style={{ position: "relative", marginBlockEnd: "var(--space-3)" }}>
          <Search
            size={16}
            strokeWidth={1.5}
            style={{
              position: "absolute",
              insetInlineStart: "var(--space-3)",
              insetBlockStart: "50%",
              transform: "translateY(-50%)",
              color: "var(--ink-3)",
            }}
          />
          <input
            autoFocus
            className="pos-input"
            style={{ paddingInlineStart: 36 }}
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div
          style={{
            maxHeight: 360,
            overflowY: "auto",
            borderRadius: 8,
            border: "1px solid var(--line)",
          }}
        >
          {q.isPending ? (
            <div className="pos-picker-empty">{t("loading")}</div>
          ) : q.isError ? (
            <div className="pos-picker-empty">{t("loadError")}</div>
          ) : (q.data?.items.length ?? 0) === 0 ? (
            <div className="pos-picker-empty">
              <div>{t("noResults")}</div>
              <a
                className="pos-link"
                href={`/${locale}/customers/new`}
                style={{ marginBlockStart: "var(--space-3)", display: "inline-flex", gap: 6 }}
              >
                <UserPlus size={14} strokeWidth={1.5} />
                {t("createNew")}
              </a>
            </div>
          ) : (
            q.data!.items.map((c: ApiCustomerSummary) => (
              <button
                key={c.id}
                type="button"
                className="pos-picker-row"
                onClick={() =>
                  onPick({
                    id: c.id,
                    name: c.name,
                    storeCreditMinor: c.store_credit_balance_minor,
                    storeCreditCurrency: c.store_credit_currency_code,
                    salesCount: c.sales_count,
                  })
                }
              >
                <div className="pos-customer-avatar serif">{c.name.slice(0, 1)}</div>
                <div style={{ flex: 1, textAlign: "start" }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                    {c.phone ?? c.email ?? c.code ?? "—"} ·{" "}
                    {t("salesCount", { count: c.sales_count })}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
