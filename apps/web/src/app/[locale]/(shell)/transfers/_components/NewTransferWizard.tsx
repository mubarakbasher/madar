"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/store";
import { branchesListRequest } from "@/lib/api/branches";
import { productsListRequest, type ApiProduct } from "@/lib/api/catalog";
import {
  transferCreateRequest,
  transferSendRequest,
  type CreateTransferBody,
} from "@/lib/api/stock-transfers";

type Step = 1 | 2 | 3;

interface DraftLine {
  product_id: string;
  qty_sent: number;
}

function pickName(i18n: { en: string; ar: string } | null | undefined, locale: string): string {
  if (!i18n) return "";
  return locale === "ar" ? i18n.ar || i18n.en : i18n.en || i18n.ar;
}

export function NewTransferWizard({ locale }: { locale: string }) {
  const t = useTranslations("transfers.wizard");
  const tErr = useTranslations("transfers.errors");

  // A manager can only dispatch FROM their own branch (the API enforces this),
  // so lock the source for managers and preselect it; owners pick any branch.
  const role = useAuthStore((s) => s.user?.role ?? "");
  const userBranchId = useAuthStore((s) => s.user?.branch_id ?? null);
  const isManager = role === "manager";
  const sourceLocked = isManager && Boolean(userBranchId);

  const [step, setStep] = useState<Step>(1);
  const [fromBranch, setFromBranch] = useState(() => (sourceLocked ? userBranchId! : ""));
  const [toBranch, setToBranch] = useState("");
  // Defensive: if auth hydrates after mount, still preselect a manager's branch.
  useEffect(() => {
    if (sourceLocked && userBranchId && !fromBranch) setFromBranch(userBranchId);
  }, [sourceLocked, userBranchId, fromBranch]);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [search, setSearch] = useState("");
  const [generalError, setGeneralError] = useState<string | null>(null);

  const branchesQ = useQuery({
    queryKey: ["branches", "list", "all-for-transfer"],
    queryFn: () => branchesListRequest({ include_inactive: false }),
    staleTime: 60_000,
  });
  const branches = branchesQ.data?.items ?? [];

  const productsQ = useQuery({
    queryKey: ["catalog", "products", "for-transfer", fromBranch || "all"],
    queryFn: () => productsListRequest({ branch_id: fromBranch || undefined }),
    staleTime: 30_000,
    enabled: step === 2 && Boolean(fromBranch),
  });
  const products = productsQ.data?.items ?? [];

  const productById = useMemo(() => {
    const m = new Map<string, ApiProduct>();
    for (const p of products) m.set(p.id, p);
    return m;
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (!search) return products.slice(0, 30);
    const q = search.toLowerCase();
    return products
      .filter((p) => {
        return (
          p.sku.toLowerCase().includes(q) ||
          (p.name_i18n.en && p.name_i18n.en.toLowerCase().includes(q)) ||
          (p.name_i18n.ar && p.name_i18n.ar.includes(search))
        );
      })
      .slice(0, 50);
  }, [products, search]);

  const create = useMutation({
    mutationFn: (body: CreateTransferBody) => transferCreateRequest(body),
    onError: (e) => setGeneralError(mapError(e, tErr)),
  });
  const send = useMutation({
    mutationFn: (id: string) => transferSendRequest(id),
    onError: (e) => setGeneralError(mapError(e, tErr)),
  });

  function addLine(productId: string) {
    if (lines.find((l) => l.product_id === productId)) return;
    setLines((prev) => [...prev, { product_id: productId, qty_sent: 1 }]);
  }

  function updateQty(productId: string, qty: number) {
    setLines((prev) =>
      prev.map((l) => (l.product_id === productId ? { ...l, qty_sent: Math.max(1, qty) } : l)),
    );
  }

  function removeLine(productId: string) {
    setLines((prev) => prev.filter((l) => l.product_id !== productId));
  }

  async function onReviewSubmit(sendNow: boolean) {
    setGeneralError(null);
    if (!fromBranch || !toBranch || lines.length === 0) return;
    const body: CreateTransferBody = {
      from_branch_id: fromBranch,
      to_branch_id: toBranch,
      notes: notes.trim() || undefined,
      lines,
    };
    try {
      const created = await create.mutateAsync(body);
      if (sendNow) {
        await send.mutateAsync(created.id);
      }
      window.location.href = `/${locale}/transfers/${created.id}`;
    } catch {
      /* surfaced via onError */
    }
  }

  const canStep1Next = Boolean(fromBranch && toBranch && fromBranch !== toBranch);
  const canStep2Next = lines.length > 0 && lines.every((l) => l.qty_sent > 0);
  // Only the source-branch manager (or an owner) may dispatch immediately.
  const canSendNow = role === "owner" || (isManager && fromBranch === userBranchId);

  return (
    <div className="xfer xfer-wizard">
      <header className="xfer-head">
        <div>
          <div className="xfer-kicker">{t("kicker")}</div>
          <h1 className="xfer-title">{t("title")}</h1>
        </div>
      </header>

      <div className="xfer-steps">
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className={`xfer-step ${step === n ? "xfer-step-active" : ""} ${step > n ? "xfer-step-done" : ""}`}
          >
            <span className="xfer-step-num">{n}</span>
            {t(`steps.${n}` as "steps.1" | "steps.2" | "steps.3")}
          </div>
        ))}
      </div>

      {generalError && <div className="xfer-field-error">{generalError}</div>}

      {step === 1 && (
        <section className="xfer-card">
          <h2 className="xfer-card-title">{t("step1.title")}</h2>
          <label className="xfer-field">
            <span className="xfer-field-label">{t("step1.fromBranch")}</span>
            <select
              value={fromBranch}
              onChange={(e) => setFromBranch(e.target.value)}
              disabled={sourceLocked || branchesQ.isPending || branchesQ.isError}
            >
              <option value="">
                {branchesQ.isPending
                  ? t("step1.loadingBranches")
                  : branchesQ.isError
                    ? t("step1.branchesError")
                    : t("step1.selectBranch")}
              </option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {pickName(b.name_i18n, locale)} · {b.code}
                </option>
              ))}
            </select>
            {sourceLocked && (
              <span className="xfer-field-hint">{t("step1.sourceLocked")}</span>
            )}
          </label>
          <label className="xfer-field">
            <span className="xfer-field-label">{t("step1.toBranch")}</span>
            <select
              value={toBranch}
              onChange={(e) => setToBranch(e.target.value)}
              disabled={branchesQ.isPending || branchesQ.isError}
            >
              <option value="">
                {branchesQ.isPending
                  ? t("step1.loadingBranches")
                  : branchesQ.isError
                    ? t("step1.branchesError")
                    : t("step1.selectBranch")}
              </option>
              {branches
                .filter((b) => b.id !== fromBranch)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {pickName(b.name_i18n, locale)} · {b.code}
                  </option>
                ))}
            </select>
          </label>
          {fromBranch && toBranch && fromBranch === toBranch && (
            <div className="xfer-field-error">{t("step1.sameBranchError")}</div>
          )}
          {branchesQ.isError && (
            <div className="xfer-field-error">
              {t("step1.branchesError")}{" "}
              <button
                type="button"
                onClick={() => branchesQ.refetch()}
                style={{
                  marginInlineStart: 6,
                  background: "transparent",
                  border: 0,
                  color: "var(--accent)",
                  cursor: "pointer",
                  textDecoration: "underline",
                  fontSize: "inherit",
                  fontFamily: "inherit",
                }}
              >
                {t("step1.retry")}
              </button>
            </div>
          )}

          <div className="xfer-foot">
            <a href={`/${locale}/transfers`} className="xfer-btn xfer-btn-ghost">
              {t("actions.cancel")}
            </a>
            <button
              type="button"
              className="xfer-btn xfer-btn-primary"
              disabled={!canStep1Next}
              onClick={() => setStep(2)}
            >
              {t("actions.next")}
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <>
          <section className="xfer-card">
            <h2 className="xfer-card-title">{t("step2.title")}</h2>
            <label className="xfer-field">
              <span className="xfer-field-label">{t("step2.searchLabel")}</span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("step2.searchPlaceholder")}
              />
            </label>

            <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid var(--rule)", borderRadius: 6 }}>
              {productsQ.isPending ? (
                <div style={{ padding: 12, fontSize: 13, color: "var(--ink-3)" }}>…</div>
              ) : filteredProducts.length === 0 ? (
                <div style={{ padding: 12, fontSize: 13, color: "var(--ink-3)" }}>{t("step2.noResults")}</div>
              ) : (
                filteredProducts.map((p) => {
                  const inLines = lines.some((l) => l.product_id === p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        width: "100%",
                        padding: "8px 12px",
                        border: "none",
                        borderBottom: "1px solid var(--rule)",
                        background: inLines ? "var(--bg-elev)" : "transparent",
                        cursor: inLines ? "default" : "pointer",
                        textAlign: "start",
                        fontFamily: "inherit",
                        color: "var(--ink-1)",
                      }}
                      disabled={inLines}
                      onClick={() => addLine(p.id)}
                    >
                      <span>
                        <span style={{ fontSize: 13 }}>{pickName(p.name_i18n, locale)}</span>{" "}
                        <span className="xfer-line-sku">{p.sku}</span>
                      </span>
                      <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
                        {p.qty_on_hand} {t("step2.onHand")}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          <section className="xfer-card">
            <h2 className="xfer-card-title">{t("step2.linesTitle")}</h2>
            {lines.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--ink-3)", margin: 0 }}>{t("step2.linesEmpty")}</p>
            ) : (
              <ul className="xfer-lines">
                {lines.map((l) => {
                  const p = productById.get(l.product_id);
                  return (
                    <li key={l.product_id} className="xfer-line-row">
                      <div>
                        <div style={{ fontSize: 13 }}>{p ? pickName(p.name_i18n, locale) : l.product_id}</div>
                        <div className="xfer-line-sku">{p?.sku ?? ""}</div>
                      </div>
                      <input
                        type="number"
                        className="xfer-receive-input"
                        value={l.qty_sent}
                        onChange={(e) => updateQty(l.product_id, parseInt(e.target.value, 10) || 1)}
                        min={1}
                      />
                      <span className="xfer-line-sku">×</span>
                      <button
                        type="button"
                        className="xfer-btn xfer-btn-ghost"
                        onClick={() => removeLine(l.product_id)}
                        aria-label={t("step2.removeLine")}
                      >
                        <Trash2 size={14} strokeWidth={1.5} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <div className="xfer-foot">
            <button type="button" className="xfer-btn xfer-btn-ghost" onClick={() => setStep(1)}>
              {t("actions.back")}
            </button>
            <button
              type="button"
              className="xfer-btn xfer-btn-primary"
              disabled={!canStep2Next}
              onClick={() => setStep(3)}
            >
              {t("actions.next")}
            </button>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <section className="xfer-card">
            <h2 className="xfer-card-title">{t("step3.title")}</h2>
            <div style={{ fontSize: 13, color: "var(--ink-2)" }}>
              <strong>{t("step3.from")}:</strong>{" "}
              {pickName(branches.find((b) => b.id === fromBranch)?.name_i18n, locale)}
            </div>
            <div style={{ fontSize: 13, color: "var(--ink-2)", marginBlockStart: 4 }}>
              <strong>{t("step3.to")}:</strong>{" "}
              {pickName(branches.find((b) => b.id === toBranch)?.name_i18n, locale)}
            </div>
            <div style={{ fontSize: 13, color: "var(--ink-2)", marginBlockStart: 4 }}>
              <strong>{t("step3.lines")}:</strong> {lines.length} ·{" "}
              {lines.reduce((s, l) => s + l.qty_sent, 0)} {t("step3.units")}
            </div>
            <label className="xfer-field" style={{ marginBlockStart: 12 }}>
              <span className="xfer-field-label">{t("step3.notes")}</span>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
          </section>

          <div className="xfer-foot">
            <button type="button" className="xfer-btn xfer-btn-ghost" onClick={() => setStep(2)}>
              {t("actions.back")}
            </button>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="xfer-btn"
                disabled={create.isPending || send.isPending}
                onClick={() => onReviewSubmit(false)}
              >
                {create.isPending ? t("actions.saving") : t("actions.saveDraft")}
              </button>
              {canSendNow && (
                <button
                  type="button"
                  className="xfer-btn xfer-btn-primary"
                  disabled={create.isPending || send.isPending}
                  onClick={() => onReviewSubmit(true)}
                >
                  {send.isPending ? t("actions.sending") : t("actions.sendNow")}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function mapError(err: unknown, t: (k: string) => string): string {
  if (err instanceof ApiError) {
    if (err.code === "unknown_product") return t("unknown_product");
    if (err.code === "unknown_branch") return t("unknown_branch");
    if (err.code === "duplicate_product") return t("duplicate_product");
    if (err.code === "transfer_empty") return t("transfer_empty");
    if (err.code === "transfer_not_sendable") return t("transfer_not_sendable");
    if (err.code === "forbidden_role") return t("forbidden_role");
    if (err.code === "forbidden_branch") return t("forbidden_branch");
    if (err.code === "validation_failed") return t("validation_failed");
    return err.message;
  }
  return t("saveFailed");
}
