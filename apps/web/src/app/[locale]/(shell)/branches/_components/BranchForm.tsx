"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/client";
import {
  branchCreateRequest,
  branchUpdateRequest,
  type ApiBranchDetail,
  type CreateBranchBody,
  type UpdateBranchBody,
} from "@/lib/api/branches";
import { useAuthStore } from "@/lib/auth/store";

const COMMON_TIMEZONES = [
  "Africa/Cairo",
  "Asia/Riyadh",
  "Asia/Dubai",
  "Europe/Istanbul",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Tokyo",
  "Asia/Singapore",
  "UTC",
];

const COMMON_CURRENCIES = ["EGP", "SDG", "SAR", "AED", "USD", "EUR", "GBP", "TRY", "JOD", "KWD"];

interface FormErrors {
  code?: string;
  name_en?: string;
  name_ar?: string;
  general?: string;
}

export function BranchForm({
  locale,
  mode,
  initial,
}: {
  locale: string;
  mode: "create" | "edit";
  initial?: ApiBranchDetail;
}) {
  const t = useTranslations("branches.form");
  const qc = useQueryClient();

  const [code, setCode] = useState(initial?.code ?? "");
  const [nameEn, setNameEn] = useState(initial?.name_i18n.en ?? "");
  const [nameAr, setNameAr] = useState(initial?.name_i18n.ar ?? "");
  const [addressEn, setAddressEn] = useState(initial?.address_i18n?.en ?? "");
  const [addressAr, setAddressAr] = useState(initial?.address_i18n?.ar ?? "");
  const [currencyCode, setCurrencyCode] = useState(
    initial?.currency_code ?? useAuthStore.getState().tenant?.default_currency_code ?? "USD",
  );
  const [timezone, setTimezone] = useState(initial?.timezone ?? "Africa/Cairo");
  const [openedAt, setOpenedAt] = useState(initial?.opened_at ?? "");
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [geoLat, setGeoLat] = useState<string>(
    initial?.geo_lat !== null && initial?.geo_lat !== undefined ? String(initial.geo_lat) : "",
  );
  const [geoLng, setGeoLng] = useState<string>(
    initial?.geo_lng !== null && initial?.geo_lng !== undefined ? String(initial.geo_lng) : "",
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [tab, setTab] = useState<"en" | "ar">("en");

  const isEdit = mode === "edit";

  const create = useMutation({
    mutationFn: (body: CreateBranchBody) => branchCreateRequest(body),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["branches"] });
      window.location.href = `/${locale}/branches/${data.id}`;
    },
    onError: (e: unknown) => setErrors(extractErrors(e, t)),
  });

  const update = useMutation({
    mutationFn: (body: UpdateBranchBody) => branchUpdateRequest(initial!.id, body),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["branches"] });
      window.location.href = `/${locale}/branches/${data.id}`;
    },
    onError: (e: unknown) => setErrors(extractErrors(e, t)),
  });

  const saving = create.isPending || update.isPending;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const errs: FormErrors = {};
    if (!code.trim()) errs.code = t("errors.required");
    else if (!/^[A-Z0-9_-]{2,16}$/.test(code.trim().toUpperCase())) errs.code = t("errors.codePattern");
    if (!nameEn.trim()) errs.name_en = t("errors.required");
    if (!nameAr.trim()) errs.name_ar = t("errors.required");
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});

    const addressPayload =
      addressEn.trim() || addressAr.trim()
        ? {
            en: addressEn.trim() || undefined,
            ar: addressAr.trim() || undefined,
          }
        : undefined;

    // Parse coordinates: both empty -> null clear; both set -> persist; partial -> error.
    const latStr = geoLat.trim();
    const lngStr = geoLng.trim();
    let parsedLat: number | null = null;
    let parsedLng: number | null = null;
    if (latStr === "" && lngStr === "") {
      parsedLat = null;
      parsedLng = null;
    } else if (latStr === "" || lngStr === "") {
      setErrors({ general: t("fields.geoHint") });
      return;
    } else {
      const lat = Number(latStr);
      const lng = Number(lngStr);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
        setErrors({ general: t("errors.validation_failed") });
        return;
      }
      parsedLat = lat;
      parsedLng = lng;
    }

    if (isEdit) {
      const body: UpdateBranchBody = {
        code: code.trim().toUpperCase(),
        name_i18n: { en: nameEn.trim(), ar: nameAr.trim() },
        address_i18n: addressPayload ?? null,
        currency_code: currencyCode,
        timezone,
        opened_at: openedAt || null,
        is_active: isActive,
        geo_lat: parsedLat,
        geo_lng: parsedLng,
      };
      update.mutate(body);
    } else {
      const body: CreateBranchBody = {
        code: code.trim().toUpperCase(),
        name_i18n: { en: nameEn.trim(), ar: nameAr.trim() },
        address_i18n: addressPayload ?? null,
        currency_code: currencyCode,
        timezone,
      };
      if (openedAt) body.opened_at = openedAt;
      if (parsedLat !== null) body.geo_lat = parsedLat;
      if (parsedLng !== null) body.geo_lng = parsedLng;
      create.mutate(body);
    }
  }

  return (
    <div className="br br-form-wrap">
      <header className="br-head">
        <div className="br-kicker">{isEdit ? t("kickerEdit") : t("kickerCreate")}</div>
        <h1 className="br-title">{isEdit ? t("titleEdit") : t("titleCreate")}</h1>
      </header>

      {errors.general && <div className="br-field-error">{errors.general}</div>}

      <form onSubmit={onSubmit}>
        <section className="br-form-section">
          <h2 className="br-form-section-title">{t("sections.basics")}</h2>

          <label className="br-field">
            <span className="br-field-label">{t("fields.code")}</span>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={16}
              autoFocus={!isEdit}
              required
            />
            <span className="br-field-hint">{t("fields.codeHint")}</span>
            {errors.code && <span className="br-field-error">{errors.code}</span>}
          </label>

          <div className="br-tab-strip" style={{ marginBottom: 8 }}>
            <button type="button" aria-pressed={tab === "en"} onClick={() => setTab("en")}>
              {t("tabs.en")}
            </button>
            <button type="button" aria-pressed={tab === "ar"} onClick={() => setTab("ar")}>
              {t("tabs.ar")}
            </button>
          </div>

          {tab === "en" ? (
            <>
              <label className="br-field">
                <span className="br-field-label">{t("fields.nameEn")}</span>
                <input
                  type="text"
                  value={nameEn}
                  onChange={(e) => setNameEn(e.target.value)}
                  placeholder={t("fields.namePlaceholder")}
                  maxLength={120}
                  required
                />
                {errors.name_en && <span className="br-field-error">{errors.name_en}</span>}
              </label>
              <label className="br-field">
                <span className="br-field-label">{t("fields.addressEn")}</span>
                <textarea
                  value={addressEn}
                  onChange={(e) => setAddressEn(e.target.value)}
                  maxLength={500}
                />
              </label>
            </>
          ) : (
            <>
              <label className="br-field" dir="rtl">
                <span className="br-field-label">{t("fields.nameAr")}</span>
                <input
                  type="text"
                  value={nameAr}
                  onChange={(e) => setNameAr(e.target.value)}
                  maxLength={120}
                  required
                />
                {errors.name_ar && <span className="br-field-error">{errors.name_ar}</span>}
              </label>
              <label className="br-field" dir="rtl">
                <span className="br-field-label">{t("fields.addressAr")}</span>
                <textarea
                  value={addressAr}
                  onChange={(e) => setAddressAr(e.target.value)}
                  maxLength={500}
                />
              </label>
            </>
          )}
        </section>

        <section className="br-form-section">
          <h2 className="br-form-section-title">{t("sections.locale")}</h2>
          <label className="br-field">
            <span className="br-field-label">{t("fields.currency")}</span>
            <select value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)}>
              {COMMON_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="br-field">
            <span className="br-field-label">{t("fields.timezone")}</span>
            <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="br-form-section">
          <h2 className="br-form-section-title">{t("sections.schedule")}</h2>
          <label className="br-field">
            <span className="br-field-label">{t("fields.openedAt")}</span>
            <input
              type="date"
              value={openedAt ?? ""}
              onChange={(e) => setOpenedAt(e.target.value)}
            />
          </label>
        </section>

        <section className="br-form-section">
          <h2 className="br-form-section-title">{t("sections.geo")}</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label className="br-field">
              <span className="br-field-label">{t("fields.geoLat")}</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.0000001"
                min="-90"
                max="90"
                value={geoLat}
                onChange={(e) => setGeoLat(e.target.value)}
                placeholder="30.0444"
              />
            </label>
            <label className="br-field">
              <span className="br-field-label">{t("fields.geoLng")}</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.0000001"
                min="-180"
                max="180"
                value={geoLng}
                onChange={(e) => setGeoLng(e.target.value)}
                placeholder="31.2357"
              />
            </label>
          </div>
          <span className="br-field-hint">{t("fields.geoHint")}</span>
        </section>

        {isEdit && (
          <section className="br-form-section">
            <h2 className="br-form-section-title">{t("sections.status")}</h2>
            <label className="br-checkbox">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              <span>{t("fields.isActive")}</span>
            </label>
            <div className="br-field-hint">{t("fields.isActiveHint")}</div>
          </section>
        )}

        <div className="br-form-foot">
          <a
            className="br-btn br-btn-ghost"
            href={isEdit ? `/${locale}/branches/${initial!.id}` : `/${locale}/branches`}
          >
            {t("actions.cancel")}
          </a>
          <button
            type="submit"
            className="br-btn br-btn-primary"
            disabled={saving}
          >
            {saving
              ? isEdit
                ? t("actions.saving")
                : t("actions.creating")
              : isEdit
                ? t("actions.save")
                : t("actions.create")}
          </button>
        </div>
      </form>
    </div>
  );
}

function extractErrors(
  err: unknown,
  t: (k: string) => string,
): FormErrors {
  if (err instanceof ApiError) {
    if (err.code === "code_taken") return { code: t("errors.code_taken") };
    if (err.code === "validation_failed") {
      const out: FormErrors = { general: t("errors.validation_failed") };
      if (err.fields) {
        if (err.fields.code) out.code = err.fields.code;
        if (err.fields["name_i18n.en"]) out.name_en = err.fields["name_i18n.en"];
        if (err.fields["name_i18n.ar"]) out.name_ar = err.fields["name_i18n.ar"];
      }
      return out;
    }
    if (err.code === "currency_locked_after_sales") return { general: t("errors.currency_locked_after_sales") };
    if (err.code === "forbidden_role") return { general: t("errors.forbidden_role") };
    if (err.code === "forbidden_branch") return { general: t("errors.forbidden_branch") };
    return { general: err.message };
  }
  return { general: t("errors.saveFailed") };
}
