"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { branchesListRequest } from "@/lib/api/branches";
import { productsListRequest, type ApiProduct } from "@/lib/api/catalog";
import {
  suppliersListRequest,
  supplierCatalogListRequest,
  type ApiSupplierCatalogEntry,
  type ApiSupplierSummary,
} from "@/lib/api/suppliers";
import {
  purchaseOrderCreateRequest,
  purchaseOrderOrderRequest,
  purchaseOrderUpdateRequest,
  type ApiPODetail,
  type CreatePOBody,
  type UpdatePOBody,
} from "@/lib/api/purchase-orders";
import { useAuthStore } from "@/lib/auth/store";
import { formatCurrency } from "@/lib/currency";
import { POLineEditor, type DraftPOLine } from "./POLineEditor";
import { SendToSupplierDialog } from "./SendToSupplierDialog";

type Step = 1 | 2 | 3;

interface InitialDraft {
  supplier_id?: string;
  branch_id?: string;
  expected_at?: string;
  notes?: string;
  tax_cents?: number;
  shipping_cents?: number;
  lines?: DraftPOLine[];
}

function pickName(i18n: { en: string; ar: string } | null | undefined, locale: string): string {
  if (!i18n) return "—";
  return locale === "ar" ? i18n.ar || i18n.en : i18n.en || i18n.ar;
}

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `k-${Math.random().toString(36).slice(2)}`;
}

function blankLine(): DraftPOLine {
  return {
    key: newKey(),
    product_id: null,
    qty_ordered: 1,
    unit_cost_cents: "",
    from_catalog: false,
  };
}

function fmtDate(yyyyMmDd: string | null | undefined, locale: string): string {
  if (!yyyyMmDd) return "—";
  try {
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-EG", {
      dateStyle: "medium",
    }).format(new Date(yyyyMmDd + "T00:00:00Z"));
  } catch {
    return yyyyMmDd;
  }
}

export interface POWizardProps {
  locale: "en" | "ar";
  /** create mode (new) or edit mode (re-using an existing PO). */
  mode: "create" | "edit";
  /** In edit mode, the PO id being modified. */
  editingId?: string;
  initial?: InitialDraft;
  /** Optional `?prefill=lowstock` flag (only valid in create mode). */
  prefillLowStock?: boolean;
  prefillBranchId?: string;
  prefillSupplierId?: string;
}

/**
 * 3-step purchase-order wizard. Used by both `/new` (create) and `/[id]/edit`
 * (edit). The edit mode pre-populates from the existing PO and routes through
 * `purchaseOrderUpdateRequest`; mark-as-ordered is only available in create
 * mode (you can't "send" a PO that's already past draft from the wizard —
 * that's handled on the detail page).
 */
export function POWizard({
  locale,
  mode,
  editingId,
  initial,
  prefillLowStock,
  prefillBranchId,
  prefillSupplierId,
}: POWizardProps) {
  const t = useTranslations("purchases.wizard");
  const tErr = useTranslations("purchases.errors");
  const role = useAuthStore((s) => s.user?.role ?? "");
  const userBranchId = useAuthStore((s) => s.user?.branch_id ?? null);
  const tenantCurrency =
    useAuthStore.getState().tenant?.default_currency_code ?? "USD";

  const [step, setStep] = useState<Step>(1);
  const [supplierId, setSupplierId] = useState<string>(initial?.supplier_id ?? prefillSupplierId ?? "");
  const [branchId, setBranchId] = useState<string>(initial?.branch_id ?? prefillBranchId ?? "");
  const [expectedAt, setExpectedAt] = useState<string>(initial?.expected_at ?? "");
  const [notes, setNotes] = useState<string>(initial?.notes ?? "");
  const [lines, setLines] = useState<DraftPOLine[]>(initial?.lines ?? []);
  const [taxCents, setTaxCents] = useState<string>(
    initial?.tax_cents ? String(initial.tax_cents) : "",
  );
  const [shippingCents, setShippingCents] = useState<string>(
    initial?.shipping_cents ? String(initial.shipping_cents) : "",
  );
  const [moreOpen, setMoreOpen] = useState(false);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [prefillRan, setPrefillRan] = useState(false);
  const prefillRanRef = useRef(false);

  // ─── Data: suppliers, branches, supplier catalog, products ─────────
  const suppliersQ = useQuery({
    queryKey: ["suppliers", "list", "for-po-wizard"],
    queryFn: () => suppliersListRequest({ active_only: true, limit: 200 }),
    staleTime: 60_000,
  });
  const suppliers = suppliersQ.data?.items ?? [];

  const branchesQ = useQuery({
    queryKey: ["branches", "list", "for-po-wizard"],
    queryFn: () => branchesListRequest({ include_inactive: false }),
    staleTime: 60_000,
  });
  const branches = branchesQ.data?.items ?? [];

  const catalogQ = useQuery({
    queryKey: ["suppliers", "catalog", supplierId],
    queryFn: () => supplierCatalogListRequest(supplierId),
    enabled: Boolean(supplierId),
    staleTime: 60_000,
  });
  const catalogByProductId = useMemo(() => {
    const m = new Map<string, ApiSupplierCatalogEntry>();
    for (const c of catalogQ.data?.items ?? []) m.set(c.product_id, c);
    return m;
  }, [catalogQ.data]);

  const productsQ = useQuery({
    queryKey: ["catalog", "products", "for-po-wizard", branchId || "any"],
    queryFn: () => productsListRequest({ branch_id: branchId || undefined }),
    enabled: step === 2 || step === 3,
    staleTime: 60_000,
  });
  const products = productsQ.data?.items ?? [];

  // Manager: auto-pin their branch (server-enforced; this is just UX).
  const isManager = role === "manager";
  useEffect(() => {
    if (isManager && userBranchId && !branchId) {
      setBranchId(userBranchId);
    }
  }, [isManager, userBranchId, branchId]);

  const supplier = suppliers.find((s) => s.id === supplierId) ?? null;
  const branch = branches.find((b) => b.id === branchId) ?? null;

  // Snapshot the supplier currency once a supplier is picked (falls back to
  // tenant currency until then; affects only display, never the wire shape).
  const currency = supplier?.currency_code || tenantCurrency;

  // ─── Live totals ────────────────────────────────────────────────────
  const subtotalCents = useMemo(() => {
    let total = 0;
    for (const l of lines) {
      const cost = Number(l.unit_cost_cents) || 0;
      total += l.qty_ordered * cost;
    }
    return total;
  }, [lines]);
  const taxNum = Number(taxCents) || 0;
  const shippingNum = Number(shippingCents) || 0;
  const grandCents = subtotalCents + taxNum + shippingNum;

  // ─── Low-stock prefill (create mode only) ──────────────────────────
  // Fires once after Step 2 mounts AND supplier + branch are known AND the
  // supporting queries (products + catalog) have resolved. We then intersect
  // low-stock products at the branch with the supplier's preferred catalog
  // entries and seed the line rows.
  useEffect(() => {
    if (mode !== "create" || !prefillLowStock || prefillRanRef.current) return;
    if (step < 2) return;
    if (!supplierId || !branchId) return;
    if (productsQ.isLoading || catalogQ.isLoading) return;
    if (productsQ.isError || catalogQ.isError) return;
    if (lines.length > 0) {
      // User already has lines — respect that.
      prefillRanRef.current = true;
      setPrefillRan(true);
      return;
    }

    const productById = new Map<string, ApiProduct>();
    for (const p of products) productById.set(p.id, p);

    const drafts: DraftPOLine[] = [];
    for (const cat of catalogQ.data?.items ?? []) {
      if (!cat.is_preferred) continue;
      const p = productById.get(cat.product_id);
      if (!p) continue;
      // No server-side `low_only` filter on /products — derive client-side
      // per CLAUDE.md. The product's qty_on_hand here is for the active
      // branch (we pass branch_id to productsList).
      if (p.reorder_point === null) continue;
      if (p.qty_on_hand > p.reorder_point) continue;

      // We don't know per-branch reorder_qty from /products; use the gap
      // from reorder_point to qty_on_hand (always ≥ 1).
      const need = Math.max(1, p.reorder_point - p.qty_on_hand);
      drafts.push({
        key: newKey(),
        product_id: p.id,
        qty_ordered: need,
        unit_cost_cents: String(cat.unit_cost_cents),
        from_catalog: true,
      });
    }
    if (drafts.length > 0) {
      setLines(drafts);
    }
    prefillRanRef.current = true;
    setPrefillRan(true);
  }, [
    mode,
    prefillLowStock,
    step,
    supplierId,
    branchId,
    productsQ.isLoading,
    productsQ.isError,
    catalogQ.isLoading,
    catalogQ.isError,
    catalogQ.data,
    products,
    lines.length,
  ]);

  // ─── Mutations ──────────────────────────────────────────────────────
  function buildBody(): CreatePOBody {
    return {
      supplier_id: supplierId,
      branch_id: branchId,
      expected_at: expectedAt || undefined,
      notes: notes.trim() || undefined,
      tax_cents: taxNum || undefined,
      shipping_cents: shippingNum || undefined,
      lines: lines
        .filter((l) => l.product_id)
        .map((l) => ({
          product_id: l.product_id as string,
          qty_ordered: l.qty_ordered,
          unit_cost_cents: l.unit_cost_cents ? Number(l.unit_cost_cents) : undefined,
        })),
    };
  }

  const create = useMutation({
    mutationFn: (body: CreatePOBody) => purchaseOrderCreateRequest(body),
    onError: (e) => setGeneralError(mapError(e, tErr)),
  });
  const update = useMutation({
    mutationFn: (body: UpdatePOBody) => {
      if (!editingId) throw new Error("no editingId");
      return purchaseOrderUpdateRequest(editingId, body);
    },
    onError: (e) => setGeneralError(mapError(e, tErr)),
  });
  const order = useMutation({
    mutationFn: ({ id, send_email }: { id: string; send_email: boolean }) =>
      purchaseOrderOrderRequest(id, { send_email }),
    onError: (e) => setGeneralError(mapError(e, tErr)),
  });

  // ─── Validation gates ───────────────────────────────────────────────
  const canStep1Next = Boolean(supplierId && branchId);
  const canStep2Next =
    lines.length > 0 &&
    lines.every((l) => l.product_id && l.qty_ordered > 0);
  const isPending = create.isPending || update.isPending || order.isPending;

  // ─── Actions ────────────────────────────────────────────────────────
  async function onSaveDraft() {
    setGeneralError(null);
    if (!canStep2Next) return;
    try {
      const body = buildBody();
      const result =
        mode === "edit"
          ? await update.mutateAsync(body as UpdatePOBody)
          : await create.mutateAsync(body);
      window.location.href = `/${locale}/purchases/${result.id}`;
    } catch {
      /* error surfaced via onError */
    }
  }

  function onMarkAsOrderedClick() {
    setGeneralError(null);
    if (!canStep2Next) return;
    setSendDialogOpen(true);
  }

  async function onConfirmSend({ send_email }: { send_email: boolean }) {
    setGeneralError(null);
    try {
      const body = buildBody();
      // In edit mode, persist edits first; in create mode, create first.
      const persisted: ApiPODetail =
        mode === "edit"
          ? await update.mutateAsync(body as UpdatePOBody)
          : await create.mutateAsync(body);
      await order.mutateAsync({ id: persisted.id, send_email });
      window.location.href = `/${locale}/purchases/${persisted.id}`;
    } catch {
      setSendDialogOpen(false);
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────
  return (
    <div className="po po-wizard">
      <header className="po-head">
        <div className="po-head-text">
          <div className="po-kicker">
            {t("kicker", { step, total: 3 })}
          </div>
          <h1 className="po-title">
            {step === 1 ? t("step1.title") : step === 2 ? t("step2.title") : t("step3.title")}
          </h1>
        </div>
      </header>

      <div className="po-steps">
        {([1, 2, 3] as const).map((n) => (
          <div
            key={n}
            className={`po-step ${step === n ? "po-step-active" : ""} ${step > n ? "po-step-done" : ""}`}
          >
            <span className="po-step-num">{n}</span>
            <span className="po-step-label">{t(`stepLabels.${n}` as "stepLabels.1" | "stepLabels.2" | "stepLabels.3")}</span>
          </div>
        ))}
      </div>

      {generalError && <div className="po-error-banner">{generalError}</div>}

      {/* ───────── STEP 1 ───────── */}
      {step === 1 && (
        <section className="po-card">
          <h2 className="po-card-title">{t("step1.title")}</h2>

          <label className="po-field">
            <span className="po-field-label">{t("step1.supplier")}</span>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              disabled={suppliersQ.isPending || suppliersQ.isError || mode === "edit"}
            >
              <option value="">
                {suppliersQ.isPending
                  ? t("loadingSuppliers")
                  : suppliersQ.isError
                    ? t("suppliersError")
                    : t("step1.selectSupplier")}
              </option>
              {suppliers.map((s: ApiSupplierSummary) => (
                <option key={s.id} value={s.id}>
                  {pickName(s.name_i18n, locale)} · {s.code} · {s.currency_code}
                </option>
              ))}
            </select>
          </label>

          <label className="po-field">
            <span className="po-field-label">{t("step1.branch")}</span>
            {isManager && userBranchId ? (
              <div className="po-branch-badge">
                {pickName(branch?.name_i18n ?? null, locale)} · {branch?.code ?? ""}
              </div>
            ) : (
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                disabled={branchesQ.isPending || branchesQ.isError || mode === "edit"}
              >
                <option value="">
                  {branchesQ.isPending
                    ? t("loadingBranches")
                    : branchesQ.isError
                      ? t("branchesError")
                      : t("step1.selectBranch")}
                </option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {pickName(b.name_i18n, locale)} · {b.code}
                  </option>
                ))}
              </select>
            )}
          </label>

          <label className="po-field">
            <span className="po-field-label">{t("step1.expectedAt")}</span>
            <input
              type="date"
              value={expectedAt}
              onChange={(e) => setExpectedAt(e.target.value)}
            />
            <div className="po-field-hint">{t("step1.expectedAtHint")}</div>
          </label>

          <div className="po-foot">
            <a href={`/${locale}/purchases`} className="po-btn po-btn-ghost">
              {t("cancel")}
            </a>
            <button
              type="button"
              className="po-btn po-btn-primary"
              disabled={!canStep1Next}
              onClick={() => setStep(2)}
            >
              {t("step1.next")}
            </button>
          </div>
        </section>
      )}

      {/* ───────── STEP 2 ───────── */}
      {step === 2 && (
        <>
          <section className="po-card">
            <h2 className="po-card-title">{t("step2.title")}</h2>
            <div className="po-field-hint" style={{ marginBlockEnd: 12 }}>
              {supplier && (
                <>
                  <strong style={{ color: "var(--ink)" }}>{pickName(supplier.name_i18n, locale)}</strong>
                  {" · "}
                  {t("step2.currency", { code: currency })}
                </>
              )}
            </div>

            {prefillLowStock && !prefillRan && (
              <div className="po-banner-warning" style={{ marginBlockEnd: 12 }}>
                {t("step2.prefillLoading")}
              </div>
            )}

            <div className="po-lines">
              {lines.map((line) => (
                <POLineEditor
                  key={line.key}
                  line={line}
                  products={products}
                  catalogByProductId={catalogByProductId}
                  currencyCode={currency}
                  locale={locale}
                  onChange={(next) =>
                    setLines((prev) =>
                      prev.map((l) => (l.key === line.key ? next : l)),
                    )
                  }
                  onRemove={() =>
                    setLines((prev) => prev.filter((l) => l.key !== line.key))
                  }
                />
              ))}
            </div>

            <div className="po-line-add">
              <button
                type="button"
                className="po-btn"
                onClick={() => setLines((prev) => [...prev, blankLine()])}
              >
                <Plus size={14} strokeWidth={1.5} /> {t("step2.addLine")}
              </button>
            </div>

            <div className="po-subtotal-box">
              <span className="po-subtotal-label">{t("step2.subtotal")}</span>
              <span className="po-subtotal-value">
                {formatCurrency(subtotalCents / 100, currency, locale)}
              </span>
            </div>

            <div style={{ marginBlockStart: 14 }}>
              {!moreOpen ? (
                <button
                  type="button"
                  className="po-more-toggle"
                  onClick={() => setMoreOpen(true)}
                >
                  + {t("step2.moreLabel")}
                </button>
              ) : (
                <div className="po-field-row">
                  <label className="po-field">
                    <span className="po-field-label">{t("step2.tax")}</span>
                    <input
                      type="number"
                      min={0}
                      step="1"
                      value={taxCents}
                      onChange={(e) => setTaxCents(e.target.value)}
                      placeholder="0"
                    />
                    <div className="po-field-hint">{t("step2.centsHint")}</div>
                  </label>
                  <label className="po-field">
                    <span className="po-field-label">{t("step2.shipping")}</span>
                    <input
                      type="number"
                      min={0}
                      step="1"
                      value={shippingCents}
                      onChange={(e) => setShippingCents(e.target.value)}
                      placeholder="0"
                    />
                    <div className="po-field-hint">{t("step2.centsHint")}</div>
                  </label>
                </div>
              )}
            </div>
          </section>

          <div className="po-foot">
            <button type="button" className="po-btn po-btn-ghost" onClick={() => setStep(1)}>
              {t("back")}
            </button>
            <button
              type="button"
              className="po-btn po-btn-primary"
              disabled={!canStep2Next}
              onClick={() => setStep(3)}
            >
              {t("step2.next")}
            </button>
          </div>
        </>
      )}

      {/* ───────── STEP 3 ───────── */}
      {step === 3 && (
        <>
          <section className="po-card">
            <h2 className="po-card-title">{t("step3.title")}</h2>

            <div className="po-step3-grid">
              <div>
                <div className="po-field-row">
                  <div>
                    <div className="po-field-label">{t("step3.supplier")}</div>
                    <div style={{ fontSize: 14, color: "var(--ink)" }}>
                      {supplier ? `${pickName(supplier.name_i18n, locale)} · ${supplier.code}` : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="po-field-label">{t("step3.branch")}</div>
                    <div style={{ fontSize: 14, color: "var(--ink)" }}>
                      {branch ? `${pickName(branch.name_i18n, locale)} · ${branch.code}` : "—"}
                    </div>
                  </div>
                </div>
                <div className="po-field-row" style={{ marginBlockStart: 12 }}>
                  <div>
                    <div className="po-field-label">{t("step3.expectedAt")}</div>
                    <div style={{ fontSize: 14, color: "var(--ink)" }}>
                      {fmtDate(expectedAt, locale)}
                    </div>
                  </div>
                  <div>
                    <div className="po-field-label">{t("step3.currency")}</div>
                    <div style={{ fontSize: 14, color: "var(--ink)" }}>{currency}</div>
                  </div>
                </div>

                <div style={{ marginBlockStart: 16 }}>
                  <table className="po-lines-table">
                    <thead>
                      <tr>
                        <th>{t("step3.product")}</th>
                        <th className="po-num">{t("step3.qty")}</th>
                        <th className="po-num">{t("step3.unitCost")}</th>
                        <th className="po-num">{t("step3.lineTotal")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l) => {
                        const p = products.find((pp) => pp.id === l.product_id);
                        const qty = l.qty_ordered;
                        const cost = Number(l.unit_cost_cents) || 0;
                        return (
                          <tr key={l.key}>
                            <td>
                              <div className="po-line-name">
                                {p ? pickName(p.name_i18n, locale) : "—"}
                              </div>
                              <div className="po-line-sku">{p?.sku ?? ""}</div>
                            </td>
                            <td className="po-num">{qty}</td>
                            <td className="po-num">
                              {formatCurrency(cost / 100, currency, locale)}
                            </td>
                            <td className="po-num">
                              {formatCurrency((qty * cost) / 100, currency, locale)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <label className="po-field" style={{ marginBlockStart: 16 }}>
                  <span className="po-field-label">{t("step3.notes")}</span>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value.slice(0, 2000))}
                    placeholder={t("step3.notesPlaceholder")}
                  />
                  <div className="po-field-hint">{notes.length} / 2000</div>
                </label>
              </div>

              <div className="po-totals">
                <div className="po-totals-row">
                  <span className="po-totals-row-label">{t("step3.subtotal")}</span>
                  <span>{formatCurrency(subtotalCents / 100, currency, locale)}</span>
                </div>
                <div className="po-totals-row">
                  <span className="po-totals-row-label">{t("step3.tax")}</span>
                  <span>{formatCurrency(taxNum / 100, currency, locale)}</span>
                </div>
                <div className="po-totals-row">
                  <span className="po-totals-row-label">{t("step3.shipping")}</span>
                  <span>{formatCurrency(shippingNum / 100, currency, locale)}</span>
                </div>
                <div className="po-totals-grand">
                  <span className="po-field-label">{t("step3.grandTotal")}</span>
                  <span className="po-totals-grand-value">
                    {formatCurrency(grandCents / 100, currency, locale)}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <div className="po-foot">
            <button type="button" className="po-btn po-btn-ghost" onClick={() => setStep(2)}>
              {t("back")}
            </button>
            <div className="po-foot-right">
              <button
                type="button"
                className="po-btn"
                disabled={isPending}
                onClick={onSaveDraft}
              >
                {isPending ? t("saving") : t("step3.saveDraft")}
              </button>
              {mode === "create" && (
                <button
                  type="button"
                  className="po-btn po-btn-primary"
                  disabled={isPending}
                  onClick={onMarkAsOrderedClick}
                >
                  {isPending ? t("saving") : t("step3.saveAndOrder")}
                </button>
              )}
            </div>
          </div>
        </>
      )}

      <SendToSupplierDialog
        open={sendDialogOpen}
        pending={isPending}
        onClose={() => setSendDialogOpen(false)}
        onConfirm={onConfirmSend}
        supplierName={supplier ? pickName(supplier.name_i18n, locale) : ""}
        supplierEmail={supplier?.contact_email ?? null}
      />
    </div>
  );
}

// Spec mapping — translated codes mirror the errors namespace exactly.
function mapError(err: unknown, t: (k: string) => string): string {
  if (err instanceof ApiError) {
    const known = [
      "validation_failed",
      "duplicate_product",
      "unknown_supplier",
      "unknown_branch",
      "unknown_product",
      "product_not_in_catalog",
      "forbidden_branch",
      "forbidden_role",
      "not_draft",
      "not_ordered",
      "purchase_order_locked",
      "not_deletable",
    ] as const;
    if ((known as readonly string[]).includes(err.code)) return t(err.code);
    return err.message;
  }
  return t("validation_failed");
}
