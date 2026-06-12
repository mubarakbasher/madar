"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Search, UserPlus, X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/store";
import {
  customersListRequest,
  type ApiCustomerSummary,
} from "@/lib/api/customers";
import { receiptDataRequest, type SaleResponse } from "@/lib/api/sales";
import {
  saleRefundsListRequest,
  saleRefundCreateRequest,
  type CreateRefundBody,
} from "@/lib/api/sale-refunds";
import {
  approversListRequest,
  type ApproverSummary,
} from "@/lib/api/users";
import {
  currencyMinorUnits,
  formatMoney as formatMoneyIntl,
  minorToMajor,
} from "@/lib/currency";

type Step = "lines" | "method" | "review";
type Method = "cash" | "card" | "bank_transfer" | "store_credit";

interface PickedLine {
  saleLineId: string;
  qty: number;
  restock: boolean;
}

function formatMoney(cents: bigint, currency: string, locale: "en" | "ar"): string {
  try {
    return formatMoneyIntl(cents, currency || "USD", locale);
  } catch {
    return `${currency} ${minorToMajor(cents, currency).toFixed(currencyMinorUnits(currency))}`;
  }
}

function bi(x: string | number | bigint): bigint {
  if (typeof x === "bigint") return x;
  return BigInt(x);
}

function pickName(i18n: { en?: string; ar?: string } | null | undefined, locale: "en" | "ar"): string {
  if (!i18n) return "";
  return locale === "ar" ? i18n.ar || i18n.en || "" : i18n.en || i18n.ar || "";
}

export function RefundClient({ saleId, locale }: { saleId: string; locale: "en" | "ar" }) {
  const t = useTranslations("refunds");
  const role = useAuthStore((s) => s.user?.role ?? "");

  const [step, setStep] = useState<Step>("lines");
  const [picks, setPicks] = useState<Record<string, PickedLine>>({});
  const [method, setMethod] = useState<Method>("cash");
  const [approvalCode, setApprovalCode] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);

  const saleQ = useQuery({
    queryKey: ["sale", saleId],
    queryFn: () => receiptDataRequest(saleId).then((r) => r.sale),
  });
  const refundsQ = useQuery({
    queryKey: ["sale-refunds", "for-sale", saleId],
    queryFn: () => saleRefundsListRequest({ sale_id: saleId, limit: 200 }),
  });
  const approversQ = useQuery({
    queryKey: ["users", "approvers"],
    queryFn: () => approversListRequest(),
    enabled: role === "cashier",
  });

  const sale: SaleResponse | undefined = saleQ.data;

  // Hydrate customer chip from sale itself when available.
  useEffect(() => {
    if (sale?.customer_id && !customerId) {
      setCustomerId(sale.customer_id);
    }
  }, [sale, customerId]);

  const refundedByLine = useMemo(() => {
    const m = new Map<string, number>();
    const items = refundsQ.data?.items ?? [];
    for (const r of items) {
      for (const l of r.lines) {
        m.set(l.sale_line_id, (m.get(l.sale_line_id) ?? 0) + l.qty);
      }
    }
    return m;
  }, [refundsQ.data]);

  const refundable = useMemo(() => {
    if (!sale) return [];
    return sale.lines
      .map((l) => ({
        line: l,
        remaining: l.qty - (refundedByLine.get(l.id) ?? 0),
      }))
      .filter((r) => r.remaining > 0);
  }, [sale, refundedByLine]);

  // Compute refund totals exactly the way the API does: each line refunds a
  // cumulative proportional share of what the customer actually PAID for it
  // (line_total_cents — net of discount; includes tax on tax-inclusive
  // sales), so partial refunds in any order sum to exactly the paid amount.
  const totals = useMemo(() => {
    if (!sale) return { subtotalCents: 0n, taxCents: 0n, totalCents: 0n, qtyPicked: 0 };

    const allLineTotal = sale.lines.reduce((s, l) => s + bi(l.line_total_cents), 0n);
    const allTax = sale.lines.reduce((s, l) => s + bi(l.tax_cents), 0n);
    const taxExclusive = allTax > 0n && bi(sale.total_cents) === allLineTotal + allTax;

    const share = (pool: bigint, origQty: number, already: number, qty: number) => {
      if (origQty <= 0) return 0n;
      const oq = BigInt(origQty);
      const upTo = (units: bigint) => (pool * units) / oq;
      return upTo(BigInt(already + qty)) - upTo(BigInt(already));
    };

    let subtotal = 0n;
    let tax = 0n;
    let qtyPicked = 0;
    for (const { line } of refundable) {
      const picked = picks[line.id]?.qty ?? 0;
      if (picked <= 0) continue;
      qtyPicked += picked;
      const already = refundedByLine.get(line.id) ?? 0;
      subtotal += share(bi(line.line_total_cents), line.qty, already, picked);
      tax += share(bi(line.tax_cents), line.qty, already, picked);
    }
    const total = taxExclusive ? subtotal + tax : subtotal;
    return { subtotalCents: subtotal, taxCents: tax, totalCents: total, qtyPicked };
  }, [sale, refundable, picks, refundedByLine]);

  const currency = sale?.currency_code ?? "USD";
  const fmt = (cents: bigint) => formatMoney(cents, currency, locale);

  const updateQty = (lineId: string, qty: number, max: number) => {
    const next = Math.max(0, Math.min(qty, max));
    setPicks((p) => {
      const prev = p[lineId];
      if (next === 0) {
        const copy = { ...p };
        delete copy[lineId];
        return copy;
      }
      return {
        ...p,
        [lineId]: { saleLineId: lineId, qty: next, restock: prev?.restock ?? true },
      };
    });
  };

  const toggleRestock = (lineId: string) => {
    setPicks((p) => {
      const current = p[lineId];
      if (!current) return p;
      return { ...p, [lineId]: { ...current, restock: !current.restock } };
    });
  };

  const createMut = useMutation({
    mutationFn: (body: CreateRefundBody) => saleRefundCreateRequest(body),
    onSuccess: (refund) => {
      const code = refund.code;
      // Land back on the receipt — refund row will surface via refundsQ refetch.
      window.location.assign(
        `/${locale}/sales/${saleId}/receipt?refunded=${encodeURIComponent(code)}`,
      );
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError && err.code === "manager_approval_required") {
        setApprovalModalOpen(true);
        return;
      }
      if (err instanceof ApiError) {
        const msg = t(`errors.${err.code}` as never, { default: err.message });
        setGeneralError(typeof msg === "string" ? msg : err.message);
        return;
      }
      setGeneralError(t("errors.network"));
    },
  });

  const submit = (approvedByUserId?: string, approverPassword?: string) => {
    if (!sale) return;
    setGeneralError(null);
    const body: CreateRefundBody = {
      sale_id: saleId,
      lines: Object.values(picks).map((p) => ({
        sale_line_id: p.saleLineId,
        qty: p.qty,
        restock: p.restock,
      })),
      payments: [
        {
          method,
          amount_cents: totals.totalCents.toString(),
          ...(method === "card" && approvalCode ? { approval_code: approvalCode } : {}),
        },
      ],
      notes: notes.trim() ? notes.trim() : null,
      customer_id: method === "store_credit" ? customerId : null,
      ...(approvedByUserId ? { approved_by_user_id: approvedByUserId } : {}),
      ...(approverPassword ? { approver_password: approverPassword } : {}),
    };
    createMut.mutate(body);
  };

  // ─── render ──────────────────────────────────────────────────────────

  if (saleQ.isPending || refundsQ.isPending) {
    return (
      <div className="rf-page">
        <div className="rf-empty">{t("loading")}</div>
      </div>
    );
  }
  if (saleQ.isError || !sale) {
    return (
      <div className="rf-page">
        <div className="rf-empty" style={{ color: "var(--rose)" }}>
          {t("errors.sale_not_found")}
        </div>
      </div>
    );
  }
  if (sale.payment_status !== "paid") {
    return (
      <div className="rf-page">
        <div className="rf-empty">{t("errors.not_refundable")}</div>
      </div>
    );
  }
  if (refundable.length === 0) {
    return (
      <div className="rf-page">
        <div className="rf-empty">{t("errors.fully_refunded")}</div>
      </div>
    );
  }

  const canAdvanceToMethod = totals.qtyPicked > 0;
  const canAdvanceToReview =
    canAdvanceToMethod &&
    (method !== "card" || approvalCode.trim().length >= 4) &&
    (method !== "store_credit" || !!customerId);

  return (
    <div className="rf-page">
      <header className="rf-header">
        <div className="rf-kicker">
          {t("kicker")} · {sale.code}
        </div>
        <h1 className="rf-title">{t("title")}</h1>
        <p className="rf-subtitle">{t("subtitle")}</p>
      </header>

      <Stepper step={step} t={t} />

      {generalError && <div className="rf-error">{generalError}</div>}

      {step === "lines" && (
        <div className="rf-card">
          <h2 className="rf-card-title">{t("lines.title")}</h2>
          <p className="rf-card-sub">{t("lines.subtitle")}</p>

          <table className="rf-table">
            <thead>
              <tr>
                <th>{t("lines.col.sku")}</th>
                <th>{t("lines.col.name")}</th>
                <th className="rf-num">{t("lines.col.unitPrice")}</th>
                <th className="rf-num">{t("lines.col.remaining")}</th>
                <th>{t("lines.col.qty")}</th>
                <th>{t("lines.col.restock")}</th>
              </tr>
            </thead>
            <tbody>
              {refundable.map(({ line, remaining }) => {
                const picked = picks[line.id]?.qty ?? 0;
                return (
                  <tr key={line.id}>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{line.sku}</td>
                    <td>{pickName(line.name_i18n, locale)}</td>
                    <td className="rf-num">{fmt(bi(line.unit_price_cents))}</td>
                    <td className="rf-num">{remaining}</td>
                    <td>
                      <div className="rf-qty-stepper">
                        <button
                          type="button"
                          className="rf-qty-btn"
                          disabled={picked <= 0}
                          onClick={() => updateQty(line.id, picked - 1, remaining)}
                          aria-label="−"
                        >
                          −
                        </button>
                        <input
                          className="rf-qty-input"
                          type="number"
                          min={0}
                          max={remaining}
                          value={picked}
                          onChange={(e) =>
                            updateQty(line.id, Number(e.target.value) || 0, remaining)
                          }
                        />
                        <button
                          type="button"
                          className="rf-qty-btn"
                          disabled={picked >= remaining}
                          onClick={() => updateQty(line.id, picked + 1, remaining)}
                          aria-label="+"
                        >
                          +
                        </button>
                      </div>
                    </td>
                    <td>
                      <label className="rf-checkbox">
                        <input
                          type="checkbox"
                          checked={picks[line.id]?.restock ?? true}
                          disabled={picked <= 0}
                          onChange={() => toggleRestock(line.id)}
                        />
                        {t("lines.restock")}
                      </label>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {step === "method" && (
        <div className="rf-card">
          <h2 className="rf-card-title">{t("method.title")}</h2>
          <p className="rf-card-sub">{t("method.subtitle")}</p>

          <div className="rf-radio-row">
            {(["cash", "card", "bank_transfer", "store_credit"] as Method[]).map((m) => (
              <label
                key={m}
                className={`rf-radio ${method === m ? "rf-radio-active" : ""}`}
                onClick={() => setMethod(m)}
              >
                <input
                  type="radio"
                  name="refund-method"
                  checked={method === m}
                  onChange={() => setMethod(m)}
                />
                <div>
                  <div className="rf-radio-label">{t(`method.options.${m}`)}</div>
                  <div className="rf-radio-hint">{t(`method.hints.${m}`)}</div>
                </div>
              </label>
            ))}
          </div>

          {method === "card" && (
            <div className="rf-method-detail">
              <label className="rf-label">{t("method.approvalCode")}</label>
              <input
                className="rf-input"
                value={approvalCode}
                onChange={(e) => setApprovalCode(e.target.value)}
                placeholder={t("method.approvalCodePlaceholder")}
                maxLength={20}
              />
            </div>
          )}

          {method === "store_credit" && (
            <div className="rf-method-detail">
              <label className="rf-label">{t("method.customer")}</label>
              {customerId && customerName ? (
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                  <span className="rf-customer-chip">{customerName}</span>
                  <button
                    type="button"
                    className="rf-btn"
                    onClick={() => {
                      setCustomerId(null);
                      setCustomerName(null);
                    }}
                  >
                    {t("method.changeCustomer")}
                  </button>
                </div>
              ) : customerId && !customerName ? (
                // Customer attached from the original sale — show ID only as fallback.
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                  <span className="rf-customer-chip">{t("method.attachedFromSale")}</span>
                  <button
                    type="button"
                    className="rf-btn"
                    onClick={() => setPickerOpen(true)}
                  >
                    {t("method.changeCustomer")}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="rf-btn"
                  onClick={() => setPickerOpen(true)}
                >
                  <UserPlus size={14} strokeWidth={1.5} />
                  {t("method.attachCustomer")}
                </button>
              )}
            </div>
          )}

          <div className="rf-method-detail">
            <label className="rf-label">{t("method.notes")}</label>
            <textarea
              className="rf-input"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("method.notesPlaceholder")}
            />
          </div>
        </div>
      )}

      {step === "review" && (
        <div className="rf-card">
          <h2 className="rf-card-title">{t("review.title")}</h2>
          <p className="rf-card-sub">{t("review.subtitle")}</p>

          <div style={{ display: "grid", gap: "var(--space-3)", fontSize: 14 }}>
            <div className="rf-summary-row">
              <span style={{ color: "var(--ink-3)" }}>{t("review.sale")}</span>
              <span style={{ fontFamily: "var(--font-mono)" }}>{sale.code}</span>
            </div>
            <div className="rf-summary-row">
              <span style={{ color: "var(--ink-3)" }}>{t("review.lines")}</span>
              <span>{t("review.linesCount", { count: totals.qtyPicked })}</span>
            </div>
            <div className="rf-summary-row">
              <span style={{ color: "var(--ink-3)" }}>{t("review.method")}</span>
              <span>{t(`method.options.${method}`)}</span>
            </div>
            {method === "store_credit" && customerId && (
              <div className="rf-summary-row">
                <span style={{ color: "var(--ink-3)" }}>{t("review.customer")}</span>
                <span>{customerName ?? t("method.attachedFromSale")}</span>
              </div>
            )}
            {method === "card" && (
              <div className="rf-summary-row">
                <span style={{ color: "var(--ink-3)" }}>{t("method.approvalCode")}</span>
                <span style={{ fontFamily: "var(--font-mono)" }}>
                  {approvalCode || "—"}
                </span>
              </div>
            )}
            {notes && (
              <div className="rf-summary-row">
                <span style={{ color: "var(--ink-3)" }}>{t("method.notes")}</span>
                <span style={{ maxWidth: "60ch" }}>{notes}</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="rf-summary">
        <div className="rf-summary-rows">
          <div className="rf-summary-row">
            <span style={{ color: "var(--ink-3)" }}>{t("summary.subtotal")}</span>
            <span>{fmt(totals.subtotalCents)}</span>
          </div>
          {totals.taxCents > 0n && (
            <div className="rf-summary-row">
              <span style={{ color: "var(--ink-3)" }}>{t("summary.tax")}</span>
              <span>{fmt(totals.taxCents)}</span>
            </div>
          )}
          <div className="rf-summary-row">
            <span>{t("summary.total")}</span>
            <b>{fmt(totals.totalCents)}</b>
          </div>
        </div>
        <div className="rf-actions">
          {step !== "lines" && (
            <button
              type="button"
              className="rf-btn"
              onClick={() => setStep(step === "review" ? "method" : "lines")}
              disabled={createMut.isPending}
            >
              <ArrowLeft size={14} strokeWidth={1.5} className="rtl:rotate-180" />
              {t("actions.back")}
            </button>
          )}
          {step === "lines" && (
            <button
              type="button"
              className="rf-btn rf-btn-primary"
              disabled={!canAdvanceToMethod}
              onClick={() => setStep("method")}
            >
              {t("actions.next")}
              <ChevronRight size={14} strokeWidth={1.5} className="rtl:rotate-180" />
            </button>
          )}
          {step === "method" && (
            <button
              type="button"
              className="rf-btn rf-btn-primary"
              disabled={!canAdvanceToReview}
              onClick={() => setStep("review")}
            >
              {t("actions.next")}
              <ChevronRight size={14} strokeWidth={1.5} className="rtl:rotate-180" />
            </button>
          )}
          {step === "review" && (
            <button
              type="button"
              className="rf-btn rf-btn-primary"
              disabled={createMut.isPending}
              onClick={() => submit()}
            >
              {createMut.isPending ? t("actions.submitting") : t("actions.submit")}
            </button>
          )}
        </div>
      </div>

      {pickerOpen && (
        <CustomerPicker
          locale={locale}
          onClose={() => setPickerOpen(false)}
          onPick={(c) => {
            setCustomerId(c.id);
            setCustomerName(c.name);
            setPickerOpen(false);
          }}
        />
      )}

      {approvalModalOpen && (
        <ApprovalModal
          approvers={approversQ.data?.items ?? []}
          loading={approversQ.isPending}
          submitting={createMut.isPending}
          onClose={() => setApprovalModalOpen(false)}
          onConfirm={(id, password) => {
            setApprovalModalOpen(false);
            submit(id, password);
          }}
        />
      )}
    </div>
  );
}

function Stepper({
  step,
  t,
}: {
  step: Step;
  t: ReturnType<typeof useTranslations<"refunds">>;
}) {
  const order: Step[] = ["lines", "method", "review"];
  return (
    <div className="rf-stepper">
      {order.map((s, idx) => {
        const isActive = s === step;
        const isDone = order.indexOf(step) > idx;
        return (
          <span
            key={s}
            className={`rf-step ${isActive ? "rf-step-active" : ""} ${isDone ? "rf-step-done" : ""}`}
          >
            <span className="rf-step-num">{idx + 1}</span>
            {t(`steps.${s}`)}
            {idx < order.length - 1 && (
              <ChevronRight size={12} strokeWidth={1.5} className="rf-step-arrow rtl:rotate-180" />
            )}
          </span>
        );
      })}
    </div>
  );
}

function CustomerPicker({
  locale,
  onClose,
  onPick,
}: {
  locale: "en" | "ar";
  onClose: () => void;
  onPick: (c: { id: string; name: string }) => void;
}) {
  const t = useTranslations("refunds.picker");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(id);
  }, [search]);

  const q = useQuery({
    queryKey: ["refund", "customer-picker", debounced],
    queryFn: () => customersListRequest({ search: debounced || undefined, limit: 50 }),
    staleTime: 30_000,
  });

  return (
    <div className="rf-modal-bg" onClick={onClose} role="dialog" aria-modal>
      <div className="rf-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3>{t("title")}</h3>
          <button
            type="button"
            className="rf-btn"
            style={{ padding: 6 }}
            onClick={onClose}
            aria-label={t("close")}
          >
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
            className="rf-input"
            style={{ paddingInlineStart: 36 }}
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="rf-picker-list">
          {q.isPending ? (
            <div className="rf-picker-empty">{t("loading")}</div>
          ) : q.isError ? (
            <div className="rf-picker-empty">{t("loadError")}</div>
          ) : (q.data?.items.length ?? 0) === 0 ? (
            <div className="rf-picker-empty">
              <div>{t("noResults")}</div>
              <a
                href={`/${locale}/customers/new`}
                className="rf-btn"
                style={{ marginBlockStart: "var(--space-3)", display: "inline-flex" }}
              >
                <UserPlus size={14} strokeWidth={1.5} />
                {t("createNew")}
              </a>
            </div>
          ) : (
            (q.data?.items ?? []).map((c: ApiCustomerSummary) => (
              <button
                key={c.id}
                type="button"
                className="rf-picker-row"
                onClick={() => onPick({ id: c.id, name: c.name })}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                    {c.phone ?? c.email ?? c.code ?? "—"}
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

function ApprovalModal({
  approvers,
  loading,
  submitting,
  onClose,
  onConfirm,
}: {
  approvers: ApproverSummary[];
  loading: boolean;
  submitting: boolean;
  onClose: () => void;
  onConfirm: (userId: string, password: string) => void;
}) {
  const t = useTranslations("refunds.approval");
  const [selected, setSelected] = useState<string>("");
  const [password, setPassword] = useState("");

  return (
    <div className="rf-modal-bg" onClick={onClose} role="dialog" aria-modal>
      <div className="rf-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{t("title")}</h3>
        <p className="rf-modal-sub">{t("subtitle")}</p>

        <label className="rf-label">{t("pickApprover")}</label>
        {loading ? (
          <div className="rf-picker-empty">{t("loading")}</div>
        ) : approvers.length === 0 ? (
          <div className="rf-picker-empty">{t("none")}</div>
        ) : (
          <select
            className="rf-input"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">{t("placeholder")}</option>
            {approvers.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {t(`role.${a.role}`)}
              </option>
            ))}
          </select>
        )}

        <label className="rf-label" style={{ marginBlockStart: "var(--space-3)" }}>
          {t("passwordLabel")}
        </label>
        <input
          type="password"
          className="rf-input"
          autoComplete="off"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("passwordPlaceholder")}
        />
        <p className="rf-modal-sub" style={{ marginBlockStart: 6 }}>
          {t("passwordHint")}
        </p>

        <div className="rf-modal-actions">
          <button type="button" className="rf-btn" onClick={onClose} disabled={submitting}>
            {t("cancel")}
          </button>
          <button
            type="button"
            className="rf-btn rf-btn-primary"
            onClick={() => selected && password && onConfirm(selected, password)}
            disabled={!selected || !password || submitting}
          >
            {submitting ? t("submitting") : t("confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
