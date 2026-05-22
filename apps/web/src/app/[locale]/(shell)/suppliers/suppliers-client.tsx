"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { suppliersListRequest } from "@/lib/api/suppliers";
import { useAuthStore } from "@/lib/auth/store";
import { formatCurrency } from "@/lib/currency";
import { SupplierCard } from "./_components/SupplierCard";
import "./suppliers.css";

export function SuppliersClient({ locale }: { locale: "en" | "ar" }) {
  const t = useTranslations("suppliers");
  const role = useAuthStore((s) => s.user?.role ?? "");
  const tenantCurrency =
    useAuthStore.getState().tenant?.default_currency_code ?? "USD";
  const canCreate = role === "owner" || role === "manager";

  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);

  const q = useQuery({
    queryKey: ["suppliers", "list", { search, activeOnly }],
    queryFn: () =>
      suppliersListRequest({
        search: search.trim() || undefined,
        active_only: activeOnly,
        limit: 100,
      }),
    staleTime: 30_000,
  });

  const items = q.data?.items ?? [];

  // Hero KPIs computed from the loaded rows (active = list reflects filter).
  // owed_cents arrives as a string per Task 7 contract — Number(...) it.
  const hero = useMemo(() => {
    let owedCents = 0;
    let openPos = 0;
    let activeCount = 0;
    for (const row of items) {
      owedCents += Number(row.owed_cents);
      openPos += row.open_pos_count;
      if (row.is_active) activeCount += 1;
    }
    return { owedCents, openPos, activeCount };
  }, [items]);

  if (q.isPending) {
    return (
      <div className="sup">
        <header className="sup-head">
          <div className="sup-head-text">
            <div className="sup-kicker">{t("kicker")}</div>
            <h1 className="sup-title">{t("title")}</h1>
          </div>
        </header>
        <div className="sup-skeleton">{t("loading")}</div>
      </div>
    );
  }

  if (q.isError) {
    return (
      <div className="sup">
        <header className="sup-head">
          <div className="sup-head-text">
            <div className="sup-kicker">{t("kicker")}</div>
            <h1 className="sup-title">{t("title")}</h1>
          </div>
        </header>
        <div className="sup-error">
          <h2>{t("error.title")}</h2>
          <p>{t("error.body")}</p>
          <button
            type="button"
            onClick={() => void q.refetch()}
            className="sup-btn sup-btn-primary"
          >
            {t("error.retry")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="sup">
      <header className="sup-head">
        <div className="sup-head-text">
          <div className="sup-kicker">{t("kicker")}</div>
          <h1 className="sup-title">{t("title")}</h1>
          <p className="sup-subtitle">{t("subtitle")}</p>
        </div>
        {canCreate && (
          <a className="sup-btn sup-btn-primary" href={`/${locale}/suppliers/new`}>
            <Plus size={14} strokeWidth={1.5} /> {t("newSupplier")}
          </a>
        )}
      </header>

      <div className="sup-hero">
        <div className="sup-hero-cell">
          <div className="sup-hero-label">{t("hero.activeSuppliers")}</div>
          <div className="sup-hero-value">{hero.activeCount}</div>
        </div>
        <div className="sup-hero-cell">
          <div className="sup-hero-label">{t("hero.totalOwed")}</div>
          <div className="sup-hero-value">
            {formatCurrency(hero.owedCents / 100, tenantCurrency, locale)}
          </div>
        </div>
        <div className="sup-hero-cell">
          <div className="sup-hero-label">{t("hero.openPos")}</div>
          <div className="sup-hero-value">{hero.openPos}</div>
        </div>
      </div>

      <div className="sup-toolbar">
        <input
          type="text"
          className="sup-search"
          placeholder={t("filters.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="sup-toggle">
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(e) => setActiveOnly(e.target.checked)}
          />
          {t("filters.activeOnly")}
        </label>
      </div>

      {items.length === 0 ? (
        <div className="sup-empty">
          <h2 className="sup-empty-title">{t("empty.title")}</h2>
          <p className="sup-empty-body">{t("empty.body")}</p>
          {canCreate && (
            <a className="sup-btn sup-btn-primary" href={`/${locale}/suppliers/new`}>
              {t("empty.cta")}
            </a>
          )}
        </div>
      ) : (
        <div className="sup-grid">
          {items.map((s) => (
            <SupplierCard key={s.id} supplier={s} locale={locale} />
          ))}
          {canCreate && (
            <a
              className="sup-card sup-card-add"
              href={`/${locale}/suppliers/new`}
              aria-label={t("addSupplier")}
            >
              <div className="sup-add-icon">
                <Plus size={22} strokeWidth={1.5} />
              </div>
              <div className="sup-add-title">{t("addSupplier")}</div>
              <div className="sup-add-sub">{t("addSupplierHint")}</div>
            </a>
          )}
        </div>
      )}
    </div>
  );
}
