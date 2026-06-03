"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Sparkles } from "lucide-react";
import {
  reorderSuggestionsRequest,
  type ApiReorderGroup,
  type ApiReorderLine,
} from "@/lib/api/reorder";
import { purchaseOrderCreateRequest } from "@/lib/api/purchase-orders";
import { ApiError } from "@/lib/api/client";
import { useBranchScopeStore, branchScopeParam } from "@/lib/branch-scope/store";
import { useAuthStore } from "@/lib/auth/store";

const HORIZONS = [7, 14, 30] as const;

function i18nName(n: { en?: string; ar?: string } | null, fallback: string, locale: "en" | "ar"): string {
  if (!n) return fallback;
  return (locale === "ar" ? n.ar || n.en : n.en || n.ar) || fallback;
}

function fmtMoney(cents: string | number, currency: string, locale: "en" | "ar"): string {
  const major = Number(cents) / 100;
  try {
    return new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-US", {
      style: "currency",
      currency: currency || "USD",
    }).format(major);
  } catch {
    return `${currency} ${major.toFixed(2)}`;
  }
}

export function ReorderClient({ locale }: { locale: "en" | "ar" }) {
  const t = useTranslations("inventory.reorder");
  const selectedBranchId = useBranchScopeStore((s) => s.selectedBranchId);
  const hydrated = useBranchScopeStore((s) => s.hydrated);
  const hydrate = useBranchScopeStore((s) => s.hydrate);
  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  const role = useAuthStore((s) => s.user?.role ?? "");
  const canReorder = role === "owner" || role === "manager";
  const branchId = branchScopeParam(selectedBranchId);
  const [horizon, setHorizon] = useState<number>(7);
  const [toast, setToast] = useState<{ code: string; id: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  const q = useQuery({
    queryKey: ["reorder", "suggestions", { branch_id: branchId, horizon }],
    queryFn: () => reorderSuggestionsRequest({ branch_id: branchId!, horizon_days: horizon }),
    enabled: !!branchId && canReorder && hydrated,
    staleTime: 30_000,
  });

  return (
    <div className="ro">
      <a href={`/${locale}/inventory`} className="ro-back">
        <ArrowLeft size={14} strokeWidth={1.5} className="rtl:rotate-180" />
        {t("back")}
      </a>

      <header className="ro-head">
        <div>
          <span className="kicker">{t("kicker")}</span>
          <h1 className="ro-title">{t("title")}</h1>
          <p className="ro-sub">{t("subtitle")}</p>
        </div>
        <div className="ro-horizons" role="tablist" aria-label={t("horizonLabel")}>
          {HORIZONS.map((h) => (
            <button
              key={h}
              type="button"
              role="tab"
              aria-selected={horizon === h}
              className="ro-horizon"
              data-active={horizon === h}
              onClick={() => setHorizon(h)}
            >
              {t("horizonDays", { days: h })}
            </button>
          ))}
        </div>
      </header>

      {!canReorder && <p className="ro-msg">{t("forbidden")}</p>}
      {canReorder && !branchId && <p className="ro-msg">{t("selectBranch")}</p>}
      {canReorder && branchId && q.isPending && <p className="ro-msg">{t("loading")}</p>}
      {canReorder && branchId && q.isError && <p className="ro-msg ro-msg-err">{t("error")}</p>}

      {canReorder && branchId && q.data && (
        <>
          {q.data.at_risk_count === 0 ? (
            <div className="ro-empty">
              <Sparkles size={28} strokeWidth={1.25} style={{ color: "var(--accent)" }} />
              <h2 className="ro-empty-title">{t("empty.title")}</h2>
              <p className="ro-empty-sub">{t("empty.sub")}</p>
            </div>
          ) : (
            <div className="ro-groups">
              {q.data.groups.map((g) => (
                <SupplierGroupCard
                  key={g.supplier_id}
                  group={g}
                  branchId={branchId}
                  locale={locale}
                  onCreated={(code, id) => setToast({ code, id })}
                />
              ))}
              {q.data.ungrouped.length > 0 && (
                <UngroupedCard lines={q.data.ungrouped} locale={locale} />
              )}
            </div>
          )}
        </>
      )}

      {toast && (
        <div className="ro-toast" role="status">
          {t("toast.created", { code: toast.code })}{" "}
          <a href={`/${locale}/purchases/${toast.id}`} className="ro-toast-link">
            {t("toast.view")}
          </a>
        </div>
      )}
    </div>
  );
}

function SupplierGroupCard({
  group,
  branchId,
  locale,
  onCreated,
}: {
  group: ApiReorderGroup;
  branchId: string;
  locale: "en" | "ar";
  onCreated: (code: string, id: string) => void;
}) {
  const t = useTranslations("inventory.reorder");
  const [qty, setQty] = useState<Record<string, number>>(() =>
    Object.fromEntries(group.lines.map((l) => [l.product_id, l.suggested_qty])),
  );
  const [busy, setBusy] = useState(false);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const total = group.lines.reduce(
    (sum, l) => sum + (qty[l.product_id] ?? 0) * Number(l.unit_cost_cents),
    0,
  );

  async function createDraft(): Promise<void> {
    setError(null);
    const lines = group.lines
      .map((l) => ({
        product_id: l.product_id,
        qty_ordered: qty[l.product_id] ?? 0,
        unit_cost_cents: Number(l.unit_cost_cents),
      }))
      .filter((l) => l.qty_ordered > 0);
    if (lines.length === 0) {
      setError(t("errors.noLines"));
      return;
    }
    setBusy(true);
    try {
      const po = await purchaseOrderCreateRequest({ supplier_id: group.supplier_id, branch_id: branchId, lines });
      setCreatedCode(po.code);
      onCreated(po.code, po.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("errors.generic"));
      setBusy(false);
    }
  }

  return (
    <section className="ro-card" data-created={createdCode ? "true" : undefined}>
      <header className="ro-card-head">
        <div>
          <h2 className="ro-card-title">{i18nName(group.supplier_name_i18n, group.supplier_code, locale)}</h2>
          <p className="ro-card-meta">
            {group.lead_time_days != null
              ? t("leadTime", { days: group.lead_time_days })
              : t("leadTimeUnknown")}
          </p>
        </div>
        {createdCode ? (
          <span className="ro-created">{t("created", { code: createdCode })}</span>
        ) : (
          <button type="button" className="ro-btn ro-btn-primary" onClick={createDraft} disabled={busy}>
            {busy ? t("creating") : t("createPo")}
          </button>
        )}
      </header>

      <table className="ro-table">
        <thead>
          <tr>
            <th className="ro-th-start">{t("col.product")}</th>
            <th className="ro-th-end">{t("col.onHand")}</th>
            <th className="ro-th-end">{t("col.cover")}</th>
            <th className="ro-th-end">{t("col.velocity")}</th>
            <th className="ro-th-end">{t("col.order")}</th>
            <th className="ro-th-end">{t("col.unitCost")}</th>
            <th className="ro-th-end">{t("col.lineTotal")}</th>
          </tr>
        </thead>
        <tbody>
          {group.lines.map((l) => {
            const n = qty[l.product_id] ?? 0;
            return (
              <tr key={l.product_id}>
                <td>
                  <code className="ro-sku">{l.sku}</code> {i18nName(l.name_i18n, l.sku, locale)}
                </td>
                <td className="ro-td-end ro-tnum">{l.qty_on_hand}</td>
                <td className="ro-td-end ro-tnum">{l.days_of_cover != null ? t("days", { days: l.days_of_cover }) : "—"}</td>
                <td className="ro-td-end ro-tnum ro-muted">{l.velocity_per_day}</td>
                <td className="ro-td-end">
                  <input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    className="ro-qty"
                    value={n}
                    disabled={!!createdCode}
                    onChange={(e) =>
                      setQty((prev) => ({ ...prev, [l.product_id]: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))
                    }
                  />
                </td>
                <td className="ro-td-end ro-tnum ro-muted">{fmtMoney(l.unit_cost_cents, group.currency_code, locale)}</td>
                <td className="ro-td-end ro-tnum">{fmtMoney(n * Number(l.unit_cost_cents), group.currency_code, locale)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={6} className="ro-td-end ro-foot-label">{t("estTotal")}</td>
            <td className="ro-td-end ro-tnum ro-foot-total">{fmtMoney(total, group.currency_code, locale)}</td>
          </tr>
        </tfoot>
      </table>
      {error && <p className="ro-card-err">{error}</p>}
    </section>
  );
}

function UngroupedCard({ lines, locale }: { lines: ApiReorderLine[]; locale: "en" | "ar" }) {
  const t = useTranslations("inventory.reorder");
  return (
    <section className="ro-card ro-card-muted">
      <header className="ro-card-head">
        <div>
          <h2 className="ro-card-title">{t("ungrouped.title")}</h2>
          <p className="ro-card-meta">{t("ungrouped.note")}</p>
        </div>
        <a href={`/${locale}/suppliers`} className="ro-btn">{t("ungrouped.assign")}</a>
      </header>
      <table className="ro-table">
        <thead>
          <tr>
            <th className="ro-th-start">{t("col.product")}</th>
            <th className="ro-th-end">{t("col.onHand")}</th>
            <th className="ro-th-end">{t("col.cover")}</th>
            <th className="ro-th-end">{t("col.suggested")}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.product_id}>
              <td>
                <code className="ro-sku">{l.sku}</code> {i18nName(l.name_i18n, l.sku, locale)}
              </td>
              <td className="ro-td-end ro-tnum">{l.qty_on_hand}</td>
              <td className="ro-td-end ro-tnum">{l.days_of_cover != null ? t("days", { days: l.days_of_cover }) : "—"}</td>
              <td className="ro-td-end ro-tnum">{l.suggested_qty}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
