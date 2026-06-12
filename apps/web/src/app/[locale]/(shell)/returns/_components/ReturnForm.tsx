"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { branchesListRequest } from "@/lib/api/branches";
import { productsListRequest } from "@/lib/api/catalog";
import {
  suppliersListRequest,
  type ApiSupplierSummary,
} from "@/lib/api/suppliers";
import {
  supplierReturnCreateRequest,
  supplierReturnSendRequest,
  supplierReturnUpdateRequest,
  type ApiReturnDetail,
  type CreateReturnBody,
  type UpdateReturnBody,
} from "@/lib/api/supplier-returns";
import { useAuthStore } from "@/lib/auth/store";
import { formatCurrency, minorToMajor } from "@/lib/currency";
import { ReturnLineEditor, type DraftRMALine } from "./ReturnLineEditor";

interface InitialDraft {
  supplier_id?: string;
  branch_id?: string;
  reason?: string;
  notes?: string;
  lines?: DraftRMALine[];
}

function pickName(
  i18n: { en: string; ar: string } | null | undefined,
  locale: string,
): string {
  if (!i18n) return "—";
  return locale === "ar" ? i18n.ar || i18n.en : i18n.en || i18n.ar;
}

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `k-${Math.random().toString(36).slice(2)}`;
}

function blankLine(): DraftRMALine {
  return {
    key: newKey(),
    product_id: null,
    qty: 1,
    unit_cost_cents: "",
    reason_code: "",
  };
}

export interface ReturnFormProps {
  locale: "en" | "ar";
  mode: "new" | "edit";
  /** In edit mode, the RMA id being modified. */
  editingId?: string;
  initial?: InitialDraft;
}

/**
 * Combined create / edit form for supplier returns. **Single-page** (not a
 * wizard) — header section, lines, footer actions. Mirrors the validation
 * gates from POWizard but flatter.
 *
 * In edit mode, supplier and branch are locked (the backend would reject the
 * change anyway and we'd rather surface "this RMA is no longer a draft" to
 * the user via the read-only banner, not a hidden 409).
 */
export function ReturnForm({ locale, mode, editingId, initial }: ReturnFormProps) {
  const t = useTranslations("returns.form");
  const tHeader = useTranslations("returns");
  const tErr = useTranslations("returns.errors");
  const role = useAuthStore((s) => s.user?.role ?? "");
  const userBranchId = useAuthStore((s) => s.user?.branch_id ?? null);
  const tenantCurrency =
    useAuthStore.getState().tenant?.default_currency_code ?? "USD";
  const isManager = role === "manager";

  const [supplierId, setSupplierId] = useState<string>(initial?.supplier_id ?? "");
  const [branchId, setBranchId] = useState<string>(initial?.branch_id ?? "");
  const [reason, setReason] = useState<string>(initial?.reason ?? "");
  const [notes, setNotes] = useState<string>(initial?.notes ?? "");
  const [lines, setLines] = useState<DraftRMALine[]>(initial?.lines ?? [blankLine()]);
  const [generalError, setGeneralError] = useState<string | null>(null);

  // ─── Data: suppliers, branches, products ───────────────────────────
  const suppliersQ = useQuery({
    queryKey: ["suppliers", "list", "for-rma-form"],
    queryFn: () => suppliersListRequest({ active_only: true, limit: 200 }),
    staleTime: 60_000,
  });
  const suppliers = suppliersQ.data?.items ?? [];

  const branchesQ = useQuery({
    queryKey: ["branches", "list", "for-rma-form"],
    queryFn: () => branchesListRequest({ include_inactive: false }),
    staleTime: 60_000,
  });
  const branches = branchesQ.data?.items ?? [];

  const productsQ = useQuery({
    queryKey: ["catalog", "products", "for-rma-form", branchId || "any"],
    queryFn: () => productsListRequest({ branch_id: branchId || undefined }),
    enabled: Boolean(supplierId && branchId),
    staleTime: 60_000,
  });
  const products = productsQ.data?.items ?? [];

  // Manager: auto-pin their branch (server-enforced; this is just UX).
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

  // ─── Live subtotal ─────────────────────────────────────────────────
  const subtotalCents = useMemo(() => {
    let total = 0;
    for (const l of lines) {
      const cost = Number(l.unit_cost_cents) || 0;
      total += l.qty * cost;
    }
    return total;
  }, [lines]);

  // ─── Validation ─────────────────────────────────────────────────────
  const reasonLen = reason.trim().length;
  const canSubmit =
    Boolean(supplierId) &&
    Boolean(branchId) &&
    reasonLen >= 1 &&
    reasonLen <= 500 &&
    notes.length <= 2000 &&
    lines.length > 0 &&
    lines.every(
      (l) => l.product_id && l.qty > 0 && Number(l.unit_cost_cents) >= 0,
    );

  // ─── Mutations ──────────────────────────────────────────────────────
  function buildBody(): CreateReturnBody {
    return {
      supplier_id: supplierId,
      branch_id: branchId,
      reason: reason.trim(),
      notes: notes.trim() || undefined,
      lines: lines
        .filter((l) => l.product_id)
        .map((l) => ({
          product_id: l.product_id as string,
          qty: l.qty,
          unit_cost_cents: Number(l.unit_cost_cents) || 0,
          reason_code: l.reason_code.trim() || undefined,
        })),
    };
  }

  const create = useMutation({
    mutationFn: (body: CreateReturnBody) => supplierReturnCreateRequest(body),
    onError: (e) => setGeneralError(mapError(e, tErr)),
  });
  const update = useMutation({
    mutationFn: (body: UpdateReturnBody) => {
      if (!editingId) throw new Error("no editingId");
      return supplierReturnUpdateRequest(editingId, body);
    },
    onError: (e) => setGeneralError(mapError(e, tErr)),
  });
  const send = useMutation({
    mutationFn: (id: string) => supplierReturnSendRequest(id),
    onError: (e) => setGeneralError(mapError(e, tErr)),
  });

  const isPending = create.isPending || update.isPending || send.isPending;

  // ─── Actions ────────────────────────────────────────────────────────
  async function onSaveDraft() {
    setGeneralError(null);
    if (!canSubmit) return;
    try {
      const body = buildBody();
      const result: ApiReturnDetail =
        mode === "edit"
          ? await update.mutateAsync(body as UpdateReturnBody)
          : await create.mutateAsync(body);
      window.location.href = `/${locale}/returns/${result.id}`;
    } catch {
      /* error surfaced via onError */
    }
  }

  async function onSaveAndSend() {
    setGeneralError(null);
    if (!canSubmit) return;
    try {
      const body = buildBody();
      const persisted: ApiReturnDetail =
        mode === "edit"
          ? await update.mutateAsync(body as UpdateReturnBody)
          : await create.mutateAsync(body);
      await send.mutateAsync(persisted.id);
      // Tiny "sent + stock decremented" snackbar is shown on the detail page
      // via the `?sent=1` query param convention. Keeps this component lean.
      window.location.href = `/${locale}/returns/${persisted.id}?sent=1`;
    } catch {
      /* error surfaced via onError */
    }
  }

  function onCancel() {
    const dirty =
      Boolean(supplierId) ||
      Boolean(branchId) ||
      reasonLen > 0 ||
      notes.length > 0 ||
      lines.some((l) => l.product_id || Number(l.unit_cost_cents) > 0);
    if (dirty) {
      const ok = window.confirm(
        tHeader("cancelConfirm.title") + "\n\n" + tHeader("cancelConfirm.body"),
      );
      if (!ok) return;
    }
    window.location.href = `/${locale}/returns`;
  }

  // ─── Render ─────────────────────────────────────────────────────────
  return (
    <div className="rma rma-form">
      <header className="rma-head">
        <div className="rma-head-text">
          <div className="rma-kicker">{tHeader("kicker")}</div>
          <h1 className="rma-title">
            {mode === "edit" ? t("editTitle") : t("newTitle")}
          </h1>
        </div>
      </header>

      {generalError && <div className="rma-error-banner">{generalError}</div>}

      {/* ─── Header section ────────────────────────────────────────── */}
      <section className="rma-card">
        <h2 className="rma-card-title">{t("supplierAndBranch")}</h2>

        <div className="rma-field-row">
          <label className="rma-field">
            <span className="rma-field-label">{t("supplier")}</span>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              disabled={
                suppliersQ.isPending || suppliersQ.isError || mode === "edit"
              }
            >
              <option value="">
                {suppliersQ.isPending
                  ? t("loadingSuppliers")
                  : suppliersQ.isError
                    ? t("suppliersError")
                    : t("selectSupplier")}
              </option>
              {suppliers.map((s: ApiSupplierSummary) => (
                <option key={s.id} value={s.id}>
                  {pickName(s.name_i18n, locale)} · {s.code} · {s.currency_code}
                </option>
              ))}
            </select>
          </label>

          <label className="rma-field">
            <span className="rma-field-label">{t("branch")}</span>
            {isManager && userBranchId ? (
              <div className="rma-branch-badge">
                {pickName(branch?.name_i18n ?? null, locale)} · {branch?.code ?? ""}
              </div>
            ) : (
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                disabled={
                  branchesQ.isPending || branchesQ.isError || mode === "edit"
                }
              >
                <option value="">
                  {branchesQ.isPending
                    ? t("loadingBranches")
                    : branchesQ.isError
                      ? t("branchesError")
                      : t("selectBranch")}
                </option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {pickName(b.name_i18n, locale)} · {b.code}
                  </option>
                ))}
              </select>
            )}
          </label>
        </div>

        <label className="rma-field">
          <span className="rma-field-label">{t("reason")}</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 500))}
            placeholder={t("reasonPlaceholder")}
          />
          <div className="rma-field-hint">{reasonLen} / 500</div>
        </label>

        <label className="rma-field">
          <span className="rma-field-label">{t("notes")}</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 2000))}
            placeholder={t("notesPlaceholder")}
          />
          <div className="rma-field-hint">{notes.length} / 2000</div>
        </label>
      </section>

      {/* ─── Lines section ─────────────────────────────────────────── */}
      <section className="rma-card">
        <h2 className="rma-card-title">{t("linesTitle")}</h2>
        {supplier && (
          <div className="rma-field-hint" style={{ marginBlockEnd: "var(--space-3)" }}>
            <strong style={{ color: "var(--ink)" }}>
              {pickName(supplier.name_i18n, locale)}
            </strong>
            {" · "}
            {t("currency", { code: currency })}
          </div>
        )}

        <div className="rma-lines">
          {lines.map((line) => (
            <ReturnLineEditor
              key={line.key}
              line={line}
              products={products}
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

        <div className="rma-line-add">
          <button
            type="button"
            className="rma-btn"
            onClick={() => setLines((prev) => [...prev, blankLine()])}
          >
            <Plus size={14} strokeWidth={1.5} /> {t("addLine")}
          </button>
        </div>

        <div className="rma-subtotal-box">
          <span className="rma-subtotal-label">{t("subtotal")}</span>
          <span className="rma-subtotal-value">
            {formatCurrency(minorToMajor(subtotalCents, currency), currency, locale)}
          </span>
        </div>
      </section>

      {/* ─── Footer actions ────────────────────────────────────────── */}
      <div className="rma-foot">
        <button
          type="button"
          className="rma-btn rma-btn-ghost"
          onClick={onCancel}
          disabled={isPending}
        >
          {t("cancel")}
        </button>
        <div className="rma-foot-right">
          <button
            type="button"
            className="rma-btn"
            disabled={!canSubmit || isPending}
            onClick={onSaveDraft}
          >
            {isPending ? t("saving") : t("saveDraft")}
          </button>
          <button
            type="button"
            className="rma-btn rma-btn-primary"
            disabled={!canSubmit || isPending}
            onClick={onSaveAndSend}
          >
            {isPending ? t("saving") : t("saveAndSend")}
          </button>
        </div>
      </div>
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
      "forbidden_branch",
      "forbidden_role",
      "not_draft",
      "not_sent",
      "not_deletable",
    ] as const;
    if ((known as readonly string[]).includes(err.code)) return t(err.code);
    return err.message;
  }
  return t("validation_failed");
}
