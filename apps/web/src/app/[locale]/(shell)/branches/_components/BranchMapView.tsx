"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ExternalLink, MapPin, Package, TrendingUp } from "lucide-react";
import type { ApiBranchSummary } from "@/lib/api/branches";
import { formatCurrency, minorToMajor } from "@/lib/currency";
import type { LngLatLike, Map as MapInstance, Marker } from "maplibre-gl";

/**
 * Map view of all geocoded branches. Uses MapLibre GL + OpenFreeMap's
 * free vector tiles (no API key needed). Branches with no coords are
 * surfaced in a side list with a CTA to add coords on the edit page.
 */
export function BranchMapView({
  branches,
  locale,
}: {
  branches: ApiBranchSummary[];
  locale: "en" | "ar";
}) {
  const t = useTranslations("branches.detail.map");
  const tBr = useTranslations("branches");
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const [selected, setSelected] = useState<ApiBranchSummary | null>(null);

  const geocoded = useMemo(
    () =>
      branches.filter(
        (b): b is ApiBranchSummary & { geo_lat: number; geo_lng: number } =>
          b.geo_lat !== null && b.geo_lng !== null,
      ),
    [branches],
  );
  const ungeocoded = useMemo(
    () => branches.filter((b) => b.geo_lat === null || b.geo_lng === null),
    [branches],
  );

  useEffect(() => {
    if (!mapEl.current) return;

    let cancelled = false;
    let markers: Marker[] = [];

    void (async () => {
      const maplibre = await import("maplibre-gl");
      if (cancelled || !mapEl.current) return;

      const center: LngLatLike = geocoded.length
        ? [geocoded[0]!.geo_lng!, geocoded[0]!.geo_lat!]
        : [31.2357, 30.0444]; // Cairo fallback

      const map = new maplibre.Map({
        container: mapEl.current,
        style: "https://tiles.openfreemap.org/styles/positron",
        center,
        zoom: geocoded.length > 1 ? 5 : 10,
        attributionControl: { compact: true },
      });
      mapRef.current = map;

      map.on("load", () => {
        if (cancelled) return;
        markers = geocoded.map((b) => {
          const el = document.createElement("button");
          el.type = "button";
          el.className = "br-map-pin";
          el.setAttribute(
            "aria-label",
            locale === "ar" ? b.name_i18n.ar || b.name_i18n.en : b.name_i18n.en,
          );
          el.addEventListener("click", (e) => {
            e.stopPropagation();
            setSelected(b);
          });
          return new maplibre.Marker({ element: el })
            .setLngLat([b.geo_lng!, b.geo_lat!])
            .addTo(map);
        });

        // Frame to bounds when there are 2+.
        if (geocoded.length > 1) {
          const bounds = new maplibre.LngLatBounds();
          geocoded.forEach((b) => bounds.extend([b.geo_lng!, b.geo_lat!]));
          map.fitBounds(bounds, { padding: 60, duration: 0, maxZoom: 12 });
        }
      });
    })();

    return () => {
      cancelled = true;
      markers.forEach((m) => m.remove());
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [geocoded, locale]);

  const dossierName = selected
    ? locale === "ar"
      ? selected.name_i18n.ar || selected.name_i18n.en
      : selected.name_i18n.en
    : null;
  const dossierAddress = selected
    ? locale === "ar"
      ? selected.address_i18n?.ar || selected.address_i18n?.en || ""
      : selected.address_i18n?.en || selected.address_i18n?.ar || ""
    : "";

  return (
    <div className="br-map-shell">
      <div className="br-map-canvas-wrap">
        {geocoded.length === 0 ? (
          <div className="br-empty" style={{ minHeight: 420 }}>
            <h2 className="br-empty-title">{t("missing")}</h2>
            <p className="br-empty-body">{t("missingHint")}</p>
          </div>
        ) : (
          <div ref={mapEl} className="br-map-canvas" />
        )}

        {ungeocoded.length > 0 && (
          <div className="br-map-pending">
            <h4 className="br-section-title" style={{ fontSize: 13 }}>
              {t("missing")}
            </h4>
            <ul className="br-list">
              {ungeocoded.map((b) => {
                const name = locale === "ar" ? b.name_i18n.ar || b.name_i18n.en : b.name_i18n.en;
                return (
                  <li key={b.id} className="br-list-item">
                    <span>{name}</span>
                    <a
                      className="br-link"
                      href={`/${locale}/branches/${b.id}/edit`}
                      style={{ fontSize: 12 }}
                    >
                      {tBr("quick.edit")}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {selected && dossierName && (
        <aside className="br-map-dossier">
          <header className="br-map-dossier-head">
            <div>
              <div className="br-kicker" style={{ marginBlockEnd: 4 }}>
                {selected.code}
              </div>
              <h3 className="br-title" style={{ fontSize: 22, margin: 0 }}>
                {dossierName}
              </h3>
              {dossierAddress && (
                <p className="br-card-address" style={{ marginBlockStart: 4 }}>
                  <MapPin size={11} strokeWidth={1.5} style={{ marginInlineEnd: 4 }} />
                  {dossierAddress}
                </p>
              )}
            </div>
            <button type="button" className="br-btn br-btn-ghost" onClick={() => setSelected(null)}>
              ×
            </button>
          </header>

          <dl className="br-map-stats">
            <div>
              <dt>{tBr("salesToday")}</dt>
              <dd>
                {formatCurrency(
                  minorToMajor(selected.today_revenue_cents, selected.currency_code),
                  selected.currency_code,
                  locale,
                )}
              </dd>
            </div>
            <div>
              <dt>{tBr("quick.staff")}</dt>
              <dd>{selected.staff_count}</dd>
            </div>
            <div>
              <dt>{tBr("quick.stock")}</dt>
              <dd>{selected.product_count}</dd>
            </div>
          </dl>

          <div className="br-actions-row">
            <a className="br-btn" href={`/${locale}/branches/${selected.id}`}>
              <ExternalLink size={13} strokeWidth={1.5} /> {t("dossier.open")}
            </a>
            <a className="br-btn" href={`/${locale}/branches/${selected.id}/dashboard`}>
              <TrendingUp size={13} strokeWidth={1.5} /> {t("dossier.performance")}
            </a>
            <a className="br-btn br-btn-ghost" href={`/${locale}/branches/${selected.id}`}>
              <Package size={13} strokeWidth={1.5} /> {t("dossier.stock")}
            </a>
          </div>
        </aside>
      )}
    </div>
  );
}
