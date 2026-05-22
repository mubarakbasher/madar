"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import {
  businessGetRequest,
  businessUpdateRequest,
  tenantLogoSetRequest,
  tenantLogoClearRequest,
  tenantLogoPublicUrl,
  type BusinessSnapshot,
  type BusinessTypeValue,
  type UpdateBusinessBody,
} from "@/lib/api/business";
import { meRequest } from "@/lib/api/auth";
import { useAuthStore } from "@/lib/auth/store";

type NameLocale = "en" | "ar";

interface FormState {
  nameEn: string;
  nameAr: string;
  legal_name: string;
  business_type: BusinessTypeValue | "";
  default_currency_code: string;
  timezone: string;
  fiscal_year_start_month: number;
  tax_registration_number: string;
  tax_inclusive_default: boolean;
  default_locale: "en" | "ar";
}

const CURRENCY_OPTIONS = [
  "USD",
  "EUR",
  "GBP",
  "EGP",
  "SDG",
  "SAR",
  "AED",
  "KWD",
  "BHD",
  "OMR",
  "QAR",
  "JOD",
  "MAD",
  "TND",
];

const TIMEZONE_OPTIONS = [
  "Africa/Cairo",
  "Asia/Riyadh",
  "Asia/Dubai",
  "Asia/Kuwait",
  "Asia/Bahrain",
  "Asia/Muscat",
  "Asia/Qatar",
  "Asia/Amman",
  "Africa/Casablanca",
  "Africa/Tunis",
  "Europe/London",
  "UTC",
];

const BUSINESS_TYPES: BusinessTypeValue[] = [
  "retail",
  "wholesale",
  "restaurant",
  "pharmacy",
  "services",
  "other",
];

function snapshotToForm(s: BusinessSnapshot): FormState {
  return {
    nameEn: s.name_i18n.en,
    nameAr: s.name_i18n.ar,
    legal_name: s.legal_name ?? "",
    business_type: s.business_type ?? "",
    default_currency_code: s.default_currency_code,
    timezone: s.timezone,
    fiscal_year_start_month: s.fiscal_year_start_month,
    tax_registration_number: s.tax_registration_number ?? "",
    tax_inclusive_default: s.tax_inclusive_default,
    default_locale: (s.default_locale === "ar" ? "ar" : "en") as "en" | "ar",
  };
}

function diff(
  form: FormState,
  snap: BusinessSnapshot,
): { body: UpdateBusinessBody; dirty: boolean } {
  const body: UpdateBusinessBody = {};
  if (
    form.nameEn.trim() !== snap.name_i18n.en ||
    form.nameAr.trim() !== snap.name_i18n.ar
  ) {
    body.name_i18n = { en: form.nameEn.trim(), ar: form.nameAr.trim() };
    // Auto-mirror EN into the legacy plain `name` column.
    body.name = form.nameEn.trim();
  }
  const trimmedLegal = form.legal_name.trim() || null;
  if (trimmedLegal !== snap.legal_name) body.legal_name = trimmedLegal;
  const incomingType = (form.business_type || null) as BusinessTypeValue | null;
  if (incomingType !== snap.business_type) body.business_type = incomingType;
  if (form.default_currency_code !== snap.default_currency_code) {
    body.default_currency_code = form.default_currency_code;
  }
  if (form.timezone !== snap.timezone) body.timezone = form.timezone;
  if (form.fiscal_year_start_month !== snap.fiscal_year_start_month) {
    body.fiscal_year_start_month = form.fiscal_year_start_month;
  }
  const trimmedTax = form.tax_registration_number.trim() || null;
  if (trimmedTax !== snap.tax_registration_number) {
    body.tax_registration_number = trimmedTax;
  }
  if (form.tax_inclusive_default !== snap.tax_inclusive_default) {
    body.tax_inclusive_default = form.tax_inclusive_default;
  }
  if (form.default_locale !== snap.default_locale) {
    body.default_locale = form.default_locale;
  }
  return { body, dirty: Object.keys(body).length > 0 };
}

export function BusinessClient({ locale }: { locale: "en" | "ar" }) {
  const t = useTranslations("settings.business");
  const tErr = useTranslations("settings.business.errors");
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const snapshotQ = useQuery({
    queryKey: ["business", "snapshot"],
    queryFn: () => businessGetRequest(),
    staleTime: 30_000,
  });

  const [form, setForm] = useState<FormState | null>(null);
  const [nameLocale, setNameLocale] = useState<NameLocale>(locale);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [fieldError, setFieldError] = useState<{ key?: string; msg?: string }>({});
  const [generalError, setGeneralError] = useState<string | null>(null);

  useEffect(() => {
    if (snapshotQ.data && !form) setForm(snapshotToForm(snapshotQ.data));
  }, [snapshotQ.data, form]);

  const saveMut = useMutation({
    mutationFn: (body: UpdateBusinessBody) => businessUpdateRequest(body),
    onSuccess: (data) => {
      qc.setQueryData(["business", "snapshot"], data);
      setForm(snapshotToForm(data));
      setSavedAt(Date.now());
      // Refresh /me so the topbar greeting + locale follow the new tenant defaults.
      meRequest()
        .then((me) =>
          useAuthStore.setState((s) => ({ ...s, user: me.user, tenant: me.tenant })),
        )
        .catch(() => {});
      setTimeout(() => setSavedAt(null), 2500);
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        if (err.code === "invalid_timezone") {
          setFieldError({ key: "timezone", msg: tErr("invalid_timezone") });
          return;
        }
        if (err.code === "forbidden_role") {
          setGeneralError(tErr("forbidden_role"));
          return;
        }
        if (err.code === "validation_failed") {
          setGeneralError(tErr("validation_failed"));
          return;
        }
        setGeneralError(err.message);
        return;
      }
      setGeneralError(tErr("network"));
    },
  });

  const onSave = () => {
    if (!form || !snapshotQ.data) return;
    setFieldError({});
    setGeneralError(null);
    const { body, dirty } = diff(form, snapshotQ.data);
    if (!dirty) return;
    saveMut.mutate(body);
  };

  const onDiscard = () => {
    if (!snapshotQ.data) return;
    setForm(snapshotToForm(snapshotQ.data));
    setFieldError({});
    setGeneralError(null);
  };

  const monthNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-US", {
      month: "long",
    });
    return Array.from({ length: 12 }, (_, i) =>
      fmt.format(new Date(Date.UTC(2024, i, 1))),
    );
  }, [locale]);

  if (snapshotQ.isPending) {
    return <div className="bz-loading">{t("loading")}</div>;
  }
  if (snapshotQ.isError || !snapshotQ.data || !form) {
    return (
      <div className="bz-loading" style={{ color: "var(--rose)" }}>
        {t("error")}
      </div>
    );
  }

  const snap = snapshotQ.data;
  const isOwner = user?.role === "owner";
  const dirty = diff(form, snap).dirty;

  // Bake the snapshot's current values into the option lists if they aren't in
  // the curated list — so the field always shows the live value.
  const currencyOptions = CURRENCY_OPTIONS.includes(form.default_currency_code)
    ? CURRENCY_OPTIONS
    : [form.default_currency_code, ...CURRENCY_OPTIONS];
  const timezoneOptions = TIMEZONE_OPTIONS.includes(form.timezone)
    ? TIMEZONE_OPTIONS
    : [form.timezone, ...TIMEZONE_OPTIONS];

  return (
    <div className="bz-shell">
      <header className="bz-header">
        <div className="bz-kicker">{t("kicker")}</div>
        <h1 className="bz-title">{t("title")}</h1>
        <p className="bz-subtitle">{t("subtitle")}</p>
      </header>

      {!isOwner && (
        <div className="bz-error">{tErr("forbidden_role")}</div>
      )}
      {generalError && <div className="bz-error">{generalError}</div>}

      {/* Identity */}
      <section className="bz-card">
        <h2 className="bz-card-title">{t("identity.title")}</h2>
        <div className="bz-field">
          <label className="bz-label">{t("identity.name")}</label>
          <div className="bz-name-tabs">
            {(["en", "ar"] as const).map((nl) => (
              <button
                key={nl}
                type="button"
                className={`bz-name-tab ${nameLocale === nl ? "bz-name-tab-active" : ""}`}
                onClick={() => setNameLocale(nl)}
              >
                {nl === "en" ? "English" : "العربية"}
              </button>
            ))}
          </div>
          <input
            className="bz-input"
            disabled={!isOwner}
            dir={nameLocale === "ar" ? "rtl" : "ltr"}
            value={nameLocale === "ar" ? form.nameAr : form.nameEn}
            onChange={(e) =>
              setForm({
                ...form,
                ...(nameLocale === "ar"
                  ? { nameAr: e.target.value }
                  : { nameEn: e.target.value }),
              })
            }
            maxLength={120}
          />
        </div>

        <div className="bz-field">
          <label className="bz-label" htmlFor="bz-legal">{t("identity.legalName")}</label>
          <input
            id="bz-legal"
            className="bz-input"
            disabled={!isOwner}
            value={form.legal_name}
            onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
            maxLength={200}
          />
        </div>

        <div className="bz-field">
          <label className="bz-label" htmlFor="bz-tax-id">{t("identity.taxId")}</label>
          <input
            id="bz-tax-id"
            className="bz-input"
            disabled={!isOwner}
            value={form.tax_registration_number}
            onChange={(e) =>
              setForm({ ...form, tax_registration_number: e.target.value })
            }
            maxLength={40}
          />
        </div>

        <div className="bz-field">
          <label className="bz-label" htmlFor="bz-biz-type">
            {t("identity.businessType")}
          </label>
          <select
            id="bz-biz-type"
            className="bz-select"
            disabled={!isOwner}
            value={form.business_type}
            onChange={(e) =>
              setForm({
                ...form,
                business_type: (e.target.value || "") as BusinessTypeValue | "",
              })
            }
          >
            <option value="">{t("businessTypes.unset")}</option>
            {BUSINESS_TYPES.map((bt) => (
              <option key={bt} value={bt}>
                {t(`businessTypes.${bt}`)}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* Operations */}
      <section className="bz-card">
        <h2 className="bz-card-title">{t("operations.title")}</h2>

        <div className="bz-field">
          <label className="bz-label" htmlFor="bz-currency">
            {t("operations.currency")}
          </label>
          <select
            id="bz-currency"
            className="bz-select"
            disabled={!isOwner}
            value={form.default_currency_code}
            onChange={(e) =>
              setForm({ ...form, default_currency_code: e.target.value })
            }
          >
            {currencyOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <span className="bz-hint">{t("operations.currencyHint")}</span>
        </div>

        <div className="bz-field">
          <label className="bz-label">{t("operations.country")}</label>
          <div className="bz-readonly">{snap.country_code}</div>
        </div>

        <div className="bz-field">
          <label className="bz-label" htmlFor="bz-tz">
            {t("operations.timezone")}
          </label>
          <select
            id="bz-tz"
            className="bz-select"
            disabled={!isOwner}
            value={form.timezone}
            onChange={(e) => setForm({ ...form, timezone: e.target.value })}
          >
            {timezoneOptions.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
          {fieldError.key === "timezone" && fieldError.msg && (
            <div className="bz-field-error">{fieldError.msg}</div>
          )}
        </div>

        <div className="bz-field">
          <label className="bz-label" htmlFor="bz-fiscal">
            {t("operations.fiscalYear")}
          </label>
          <select
            id="bz-fiscal"
            className="bz-select"
            disabled={!isOwner}
            value={form.fiscal_year_start_month}
            onChange={(e) =>
              setForm({
                ...form,
                fiscal_year_start_month: Number(e.target.value),
              })
            }
          >
            {monthNames.map((name, i) => (
              <option key={i + 1} value={i + 1}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div className="bz-field">
          <label className="bz-label">{t("operations.defaultLocale")}</label>
          <div style={{ display: "flex", gap: 8 }}>
            {(["en", "ar"] as const).map((l) => (
              <label
                key={l}
                className="bz-name-tab"
                style={{
                  background:
                    form.default_locale === l ? "var(--accent)" : "var(--surface-1)",
                  color:
                    form.default_locale === l
                      ? "var(--accent-on)"
                      : "var(--ink-2)",
                  borderColor:
                    form.default_locale === l ? "var(--accent)" : "var(--line)",
                  cursor: isOwner ? "pointer" : "not-allowed",
                  opacity: isOwner ? 1 : 0.6,
                }}
              >
                <input
                  type="radio"
                  name="bz-tenant-locale"
                  checked={form.default_locale === l}
                  onChange={() =>
                    isOwner && setForm({ ...form, default_locale: l })
                  }
                  style={{ display: "none" }}
                />
                {l === "en" ? "English" : "العربية"}
              </label>
            ))}
          </div>
          <span className="bz-hint">{t("operations.defaultLocaleHint")}</span>
        </div>
      </section>

      {/* Tax defaults */}
      <section className="bz-card">
        <h2 className="bz-card-title">{t("tax.title")}</h2>
        <div className="bz-toggle-row">
          <div className="bz-toggle-text">
            <div className="bz-toggle-label">{t("tax.inclusive")}</div>
            <div className="bz-toggle-hint">{t("tax.inclusiveHint")}</div>
          </div>
          <label className="bz-switch">
            <input
              type="checkbox"
              checked={form.tax_inclusive_default}
              disabled={!isOwner}
              onChange={(e) =>
                setForm({ ...form, tax_inclusive_default: e.target.checked })
              }
            />
            <span className="bz-switch-slider" />
          </label>
        </div>

        <div className="bz-field" style={{ marginBlockStart: 12 }}>
          <label className="bz-label">{t("tax.defaultClass")}</label>
          <div className="bz-readonly">
            {snap.default_tax_class_id ? snap.default_tax_class_id : "—"}
          </div>
          <a className="bz-hint" href={`/${locale}/settings/tax-classes`}>
            {t("tax.manageClasses")} →
          </a>
        </div>
      </section>

      {/* Branding / logo (Slice 4) */}
      <LogoSection
        snapshot={snap}
        isOwner={isOwner}
        onChanged={(next) => {
          qc.setQueryData(["business", "snapshot"], next);
        }}
      />

      {/* Lifecycle (read-only) */}
      <section className="bz-card">
        <h2 className="bz-card-title">{t("lifecycle.title")}</h2>
        <div className="bz-lifecycle-grid">
          <div>
            <div className="bz-meta-key">{t("lifecycle.plan")}</div>
            <div className="bz-meta-value">{snap.plan?.code ?? "—"}</div>
          </div>
          <div>
            <div className="bz-meta-key">{t("lifecycle.status")}</div>
            <div>
              <span
                className={`bz-pill ${
                  snap.status === "active"
                    ? "bz-pill-sage"
                    : snap.status === "grace_period"
                      ? "bz-pill-amber"
                      : snap.status === "suspended" || snap.status === "cancelled"
                        ? "bz-pill-rose"
                        : "bz-pill-muted"
                }`}
              >
                {snap.status}
              </span>
            </div>
          </div>
          {snap.trial_ends_at && (
            <div>
              <div className="bz-meta-key">{t("lifecycle.trialEnds")}</div>
              <div className="bz-meta-value">
                {new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-US", {
                  dateStyle: "medium",
                }).format(new Date(snap.trial_ends_at))}
              </div>
            </div>
          )}
          <div>
            <div className="bz-meta-key">{t("operations.country")}</div>
            <div className="bz-meta-value">{snap.country_code}</div>
          </div>
        </div>
        <a
          className="bz-btn"
          style={{ marginBlockStart: 14 }}
          href={`/${locale}/billing`}
        >
          {t("lifecycle.manage")} →
        </a>
      </section>

      <div className="bz-saveBar">
        <span className="bz-dirty">
          {savedAt ? (
            <span className="bz-saved-pill">
              <CheckCircle2 size={12} strokeWidth={1.5} />
              {t("actions.saved")}
            </span>
          ) : dirty ? (
            t("actions.dirty")
          ) : (
            ""
          )}
        </span>
        <div className="bz-actions">
          <button
            type="button"
            className="bz-btn"
            disabled={!dirty || saveMut.isPending}
            onClick={onDiscard}
          >
            {t("actions.discard")}
          </button>
          <button
            type="button"
            className="bz-btn bz-btn-primary"
            disabled={!isOwner || !dirty || saveMut.isPending}
            onClick={onSave}
          >
            {saveMut.isPending ? t("actions.saving") : t("actions.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

function LogoSection({
  snapshot,
  isOwner,
  onChanged,
}: {
  snapshot: BusinessSnapshot;
  isOwner: boolean;
  onChanged: (next: BusinessSnapshot) => void;
}) {
  const t = useTranslations("settings.business.branding");
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const url = tenantLogoPublicUrl(snapshot.id, snapshot.logo_url);

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError(t("tooLarge"));
      return;
    }
    setError(null);
    setBusy("upload");
    try {
      const next = await tenantLogoSetRequest(file);
      onChanged(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("uploadFailed"));
    } finally {
      setBusy(null);
    }
  };

  const onRemove = async (): Promise<void> => {
    setError(null);
    setBusy("remove");
    try {
      const next = await tenantLogoClearRequest();
      onChanged(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("uploadFailed"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="bz-card">
      <h2 className="bz-card-title">{t("title")}</h2>
      <p className="bz-card-sub">{t("subtitle")}</p>
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: 12,
            background: "var(--surface-2)",
            border: "1px dashed var(--line)",
            display: "grid",
            placeItems: "center",
            overflow: "hidden",
          }}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={t("preview")}
              style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
            />
          ) : (
            <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{t("placeholder")}</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, flexDirection: "column" }}>
          <label
            className="bz-btn bz-btn-primary"
            style={{ display: "inline-flex", cursor: isOwner ? "pointer" : "not-allowed", opacity: isOwner ? 1 : 0.5 }}
          >
            {busy === "upload"
              ? t("uploading")
              : url
                ? t("replace")
                : t("upload")}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={onPickFile}
              disabled={!isOwner || busy !== null}
              style={{ display: "none" }}
            />
          </label>
          {url && (
            <button
              type="button"
              className="bz-btn"
              disabled={!isOwner || busy !== null}
              onClick={() => void onRemove()}
            >
              {busy === "remove" ? t("removing") : t("remove")}
            </button>
          )}
          <span className="bz-hint">{t("hint")}</span>
          {error && <div className="bz-field-error">{error}</div>}
        </div>
      </div>
    </section>
  );
}
