"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ArrowLeft, ImageIcon, Pencil } from "lucide-react";
import { Link } from "../../../../../../../i18n/routing";
import {
  productActivityRequest,
  productDetailRequest,
  productImagePublicUrl,
  productMovementsRequest,
  type ApiActivityItem,
  type ApiMovementItem,
  type ApiPerBranchStock,
  type ApiProductDetail,
} from "@/lib/api/catalog";
import { useAuthStore } from "@/lib/auth/store";

type Tab = "overview" | "stock" | "activity";

function formatMajor(cents: string | bigint, currency: string): string {
  const n = typeof cents === "bigint" ? Number(cents) : Number(BigInt(cents));
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n / 100);
}

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}

const KIND_TONE: Record<string, string> = {
  sale: "var(--rose)",
  receive: "var(--sage)",
  return_in: "var(--sage)",
  adjustment: "var(--amber)",
  transfer_in: "var(--accent)",
  transfer_out: "var(--accent)",
  waste: "var(--rose)",
};

export function ProductDetailClient({ id, locale }: { id: string; locale: "en" | "ar" }) {
  const t = useTranslations("inventory.detail");
  const tenant = useAuthStore((s) => s.tenant);
  const [tab, setTab] = useState<Tab>("overview");

  const detailQ = useQuery({
    queryKey: ["catalog", "detail", id],
    queryFn: () => productDetailRequest(id),
    staleTime: 15_000,
  });

  const movementsQ = useQuery({
    queryKey: ["catalog", "movements", id],
    queryFn: () => productMovementsRequest(id, { limit: 50 }),
    enabled: tab === "stock",
    staleTime: 30_000,
  });

  const activityQ = useQuery({
    queryKey: ["catalog", "activity", id],
    queryFn: () => productActivityRequest(id, { limit: 50 }),
    enabled: tab === "activity",
    staleTime: 30_000,
  });

  const imageUrl = useMemo(() => {
    if (!tenant || !detailQ.data) return null;
    return productImagePublicUrl(tenant.id, detailQ.data.id, detailQ.data.image_url);
  }, [tenant, detailQ.data]);

  const margin = useMemo(() => {
    if (!detailQ.data) return null;
    const price = Number(BigInt(detailQ.data.price_cents));
    const cost = Number(BigInt(detailQ.data.cost_cents));
    if (price <= 0) return null;
    return Math.round(((price - cost) / price) * 100);
  }, [detailQ.data]);

  if (detailQ.isPending) {
    return <div style={{ padding: 40, color: "var(--ink-3)" }}>{t("loading")}</div>;
  }
  if (detailQ.isError || !detailQ.data) {
    return <div style={{ padding: 40, color: "var(--rose)" }}>{t("errors.loadFailed")}</div>;
  }

  const p = detailQ.data;

  return (
    <div style={{ padding: "24px 0 64px" }}>
      <Link
        href="/inventory"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          color: "var(--ink-3)",
          fontSize: 13,
          textDecoration: "none",
          marginBottom: 16,
        }}
      >
        <ArrowLeft size={14} strokeWidth={1.5} className="rtl:rotate-180" />
        {t("backToInventory")}
      </Link>

      {/* Header with image + name */}
      <header style={{ display: "flex", gap: 24, alignItems: "flex-start", marginBottom: 24 }}>
        <ImageHeader
          imageUrl={imageUrl}
          color={detailQ.data.id}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <span className="kicker" style={{ textTransform: "uppercase" }}>
            {p.category_code ?? t("overview.uncategorized")} · {p.sku}
          </span>
          <h1
            style={{
              fontFamily: "var(--serif)",
              fontSize: 36,
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
              marginTop: 6,
            }}
          >
            {p.name_i18n[locale] || p.name_i18n.en}
          </h1>
          <p style={{ color: "var(--ink-3)", fontSize: 13, marginTop: 8 }}>
            <span style={{ color: p.is_active ? "var(--sage)" : "var(--ink-3)" }}>
              ● {p.is_active ? t("header.active") : t("header.inactive")}
            </span>
            <span style={{ marginInline: 8 }}>·</span>
            <span>{t("header.branches", { count: p.per_branch_stock.length })}</span>
          </p>
        </div>
        <Link
          href={`/inventory/products/${p.id}/edit`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            background: "var(--bg)",
            border: "1px solid var(--rule)",
            borderRadius: 10,
            color: "var(--ink-2)",
            fontSize: 13,
            textDecoration: "none",
            flexShrink: 0,
          }}
        >
          <Pencil size={13} strokeWidth={1.5} />
          {t("header.edit")}
        </Link>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 280px", gap: 24 }}>
        <div>
          {/* Tab strip */}
          <nav
            role="tablist"
            style={{
              display: "inline-flex",
              gap: 4,
              padding: 4,
              background: "var(--bg)",
              border: "1px solid var(--rule)",
              borderRadius: 999,
              marginBottom: 20,
            }}
          >
            {(["overview", "stock", "activity"] as const).map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                style={{
                  padding: "6px 16px",
                  borderRadius: 999,
                  background: tab === id ? "var(--accent)" : "transparent",
                  color: tab === id ? "white" : "var(--ink-2)",
                  border: "none",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                {t(`tabs.${id}`)}
              </button>
            ))}
          </nav>

          {tab === "overview" && <OverviewTab product={p} locale={locale} margin={margin} />}
          {tab === "stock" && (
            <StockTab
              perBranchStock={p.per_branch_stock}
              locale={locale}
              movements={movementsQ.data?.items ?? []}
              movementsLoading={movementsQ.isPending}
            />
          )}
          {tab === "activity" && (
            <ActivityTab items={activityQ.data?.items ?? []} loading={activityQ.isPending} />
          )}
        </div>

        {/* Sticky sidebar KPIs */}
        <aside style={{ position: "sticky", top: 24, alignSelf: "start" }}>
          <KpiCard
            label={t("kpis.stockValue")}
            value={formatMajor(p.kpis.total_stock_value_cents, p.currency_code)}
          />
          <KpiCard
            label={t("kpis.unitsSold")}
            value={String(p.kpis.units_sold_30d)}
          />
          <KpiCard
            label={t("kpis.velocity")}
            value={p.kpis.velocity_per_day.toFixed(1)}
          />
          <KpiCard
            label={t("kpis.daysOfCover")}
            value={p.kpis.days_of_cover != null ? String(p.kpis.days_of_cover) : t("kpis.neverRunOut")}
          />
        </aside>
      </div>
    </div>
  );
}

function ImageHeader({ imageUrl, color }: { imageUrl: string | null; color: string }) {
  // Match the gradient palette used by the inventory list's swatch.
  const PALETTE = [
    "#3D2817",
    "#6B3F1D",
    "#A8693B",
    "#C96442",
    "#5F4830",
    "#8B6B45",
    "#3F5A47",
    "#7A4A3F",
  ];
  let hash = 0;
  for (let i = 0; i < color.length; i++) {
    hash = (hash * 31 + color.charCodeAt(i)) | 0;
  }
  const swatch = PALETTE[Math.abs(hash) % PALETTE.length]!;
  return (
    <div
      style={{
        width: 120,
        height: 120,
        borderRadius: 16,
        overflow: "hidden",
        flexShrink: 0,
        background: imageUrl
          ? "transparent"
          : `linear-gradient(135deg, ${swatch}, color-mix(in oklab, ${swatch} 55%, #1A1714))`,
        display: "grid",
        placeItems: "center",
      }}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <ImageIcon size={32} strokeWidth={1.25} style={{ color: "rgba(255,255,255,0.5)" }} />
      )}
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--rule)",
        borderRadius: 12,
        padding: 16,
        marginBottom: 10,
      }}
    >
      <span className="kicker">{label}</span>
      <div
        style={{
          fontFamily: "var(--serif)",
          fontSize: 26,
          letterSpacing: "-0.02em",
          marginTop: 4,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function OverviewTab({
  product,
  locale,
  margin,
}: {
  product: ApiProductDetail;
  locale: "en" | "ar";
  margin: number | null;
}) {
  const t = useTranslations("inventory.detail.overview");
  const description = product.description_i18n?.[locale] ?? product.description_i18n?.en ?? null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <section
        style={{
          background: "var(--surface)",
          border: "1px solid var(--rule)",
          borderRadius: 14,
          padding: 20,
        }}
      >
        <span className="kicker">{t("description")}</span>
        <p style={{ marginTop: 8, fontSize: 14, color: "var(--ink)" }}>
          {description ?? <span style={{ color: "var(--ink-3)" }}>{t("noDescription")}</span>}
        </p>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <MiniCard label={t("category")} value={product.category_code ?? t("uncategorized")} />
        <MiniCard label={t("barcode")} value={product.barcode ?? t("noBarcode")} mono />
      </div>

      <section
        style={{
          background: "var(--surface)",
          border: "1px solid var(--rule)",
          borderRadius: 14,
          padding: 20,
        }}
      >
        <span className="kicker">{t("pricing")}</span>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginTop: 12 }}>
          <PriceCell label={t("price")} value={formatMajor(product.price_cents.toString(), product.currency_code)} />
          <PriceCell label={t("cost")} value={formatMajor(product.cost_cents.toString(), product.currency_code)} />
          <PriceCell label={t("margin")} value={margin != null ? `${margin}%` : "—"} />
        </div>
      </section>
    </div>
  );
}

function MiniCard({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--rule)",
        borderRadius: 12,
        padding: 16,
      }}
    >
      <span className="kicker">{label}</span>
      <div
        style={{
          fontSize: 15,
          marginTop: 4,
          fontFamily: mono ? "var(--mono)" : "inherit",
          color: value.startsWith("—") || value === "(deleted)" ? "var(--ink-3)" : "var(--ink)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function PriceCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="kicker">{label}</span>
      <div
        style={{
          fontFamily: "var(--serif)",
          fontSize: 22,
          letterSpacing: "-0.02em",
          marginTop: 4,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function StockTab({
  perBranchStock,
  locale,
  movements,
  movementsLoading,
}: {
  perBranchStock: ApiPerBranchStock[];
  locale: "en" | "ar";
  movements: ApiMovementItem[];
  movementsLoading: boolean;
}) {
  const t = useTranslations("inventory.detail.stock");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <section
        style={{
          background: "var(--surface)",
          border: "1px solid var(--rule)",
          borderRadius: 14,
          padding: 20,
        }}
      >
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, marginBottom: 14 }}>
          {t("perBranch")}
        </h2>
        {perBranchStock.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--ink-3)" }}>{t("empty")}</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "start", color: "var(--ink-3)", fontSize: 11, textTransform: "uppercase" }}>
                <th style={{ padding: "6px 8px", textAlign: "start" }}>{t("branch")}</th>
                <th style={{ padding: "6px 8px", textAlign: "end" }}>{t("qty")}</th>
                <th style={{ padding: "6px 8px", textAlign: "end" }}>{t("reorderPoint")}</th>
                <th style={{ padding: "6px 8px", textAlign: "end" }}>{t("available")}</th>
                <th style={{ padding: "6px 8px", textAlign: "end" }}>{t("lastMovement")}</th>
              </tr>
            </thead>
            <tbody>
              {perBranchStock.map((b) => (
                <tr key={b.branch_id} style={{ borderTop: "1px solid var(--rule)" }}>
                  <td style={{ padding: "10px 8px" }}>
                    <code style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-3)" }}>
                      {b.branch_code}
                    </code>{" "}
                    {b.branch_name_i18n[locale] || b.branch_name_i18n.en}
                  </td>
                  <td style={{ padding: "10px 8px", textAlign: "end", fontVariantNumeric: "tabular-nums" }}>
                    {b.qty_on_hand}
                  </td>
                  <td style={{ padding: "10px 8px", textAlign: "end", color: "var(--ink-3)" }}>
                    {b.reorder_point ?? "—"}
                  </td>
                  <td style={{ padding: "10px 8px", textAlign: "end" }}>{b.available}</td>
                  <td style={{ padding: "10px 8px", textAlign: "end", color: "var(--ink-3)", fontSize: 11 }}>
                    {relativeTime(b.last_movement_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section
        style={{
          background: "var(--surface)",
          border: "1px solid var(--rule)",
          borderRadius: 14,
          padding: 20,
        }}
      >
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, marginBottom: 14 }}>
          {t("movements")}
        </h2>
        {movementsLoading && (
          <p style={{ fontSize: 13, color: "var(--ink-3)" }}>Loading…</p>
        )}
        {!movementsLoading && movements.length === 0 && (
          <p style={{ fontSize: 13, color: "var(--ink-3)" }}>{t("movementsEmpty")}</p>
        )}
        {movements.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {movements.map((m) => (
              <MovementRow key={m.id} movement={m} t={t} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function MovementRow({
  movement,
  t,
}: {
  movement: ApiMovementItem;
  t: ReturnType<typeof useTranslations>;
}) {
  const tone = KIND_TONE[movement.kind] ?? "var(--ink-3)";
  const sign = movement.qty_delta >= 0 ? "+" : "";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 12px",
        background: "var(--bg)",
        border: "1px solid var(--rule)",
        borderRadius: 8,
      }}
    >
      <span
        style={{
          padding: "2px 10px",
          borderRadius: 999,
          fontSize: 11,
          background: `color-mix(in oklab, ${tone} 14%, transparent)`,
          color: tone,
        }}
      >
        {t(`kinds.${movement.kind}` as Parameters<typeof t>[0])}
      </span>
      <code style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-3)" }}>
        {movement.branch_code}
      </code>
      <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 500, color: movement.qty_delta < 0 ? tone : "var(--ink)" }}>
        {sign}
        {movement.qty_delta}
      </span>
      <span style={{ flex: 1 }} />
      {movement.reference_table === "sales" && movement.reference_id && (
        <code style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-3)" }}>
          {movement.reference_id.slice(0, 8)}
        </code>
      )}
      <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{relativeTime(movement.occurred_at)}</span>
    </div>
  );
}

function ActivityTab({ items, loading }: { items: ApiActivityItem[]; loading: boolean }) {
  const t = useTranslations("inventory.detail.activity");
  return (
    <section
      style={{
        background: "var(--surface)",
        border: "1px solid var(--rule)",
        borderRadius: 14,
        padding: 20,
      }}
    >
      <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, marginBottom: 14 }}>
        {t("title")}
      </h2>
      {loading && <p style={{ fontSize: 13, color: "var(--ink-3)" }}>Loading…</p>}
      {!loading && items.length === 0 && (
        <p style={{ fontSize: 13, color: "var(--ink-3)" }}>{t("empty")}</p>
      )}
      {items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                background: "var(--bg)",
                border: "1px solid var(--rule)",
                borderRadius: 8,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13 }}>
                  <strong>{item.user_name ?? "(system)"}</strong>{" "}
                  <span style={{ color: "var(--ink-3)" }}>
                    {t.has(`actions.${item.action}` as never)
                      ? t(`actions.${item.action}` as Parameters<typeof t>[0])
                      : item.action}
                  </span>
                </div>
                {item.impersonator_id && (
                  <div style={{ fontSize: 11, color: "var(--rose)" }}>via impersonation</div>
                )}
              </div>
              <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
                {relativeTime(item.created_at)}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
