"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/client";
import {
  supplierCreateRequest,
  supplierUpdateRequest,
  type ApiSupplierDetail,
  type CreateSupplierBody,
  type UpdateSupplierBody,
} from "@/lib/api/suppliers";
import { useAuthStore } from "@/lib/auth/store";

const COMMON_CURRENCIES = ["EGP", "SDG", "SAR", "AED", "USD", "EUR", "GBP", "TRY", "JOD", "KWD"];

interface FormErrors {
  code?: string;
  name_en?: string;
  name_ar?: string;
  contact_email?: string;
  general?: string;
}

export function SupplierForm({
  locale,
  mode,
  initial,
}: {
  locale: string;
  mode: "create" | "edit";
  initial?: ApiSupplierDetail;
}) {
  const t = useTranslations("suppliers.form");
  const qc = useQueryClient();
  const tenantCurrency =
    useAuthStore.getState().tenant?.default_currency_code ?? "USD";

  const isEdit = mode === "edit";

  const [code, setCode] = useState(initial?.code ?? "");
  const [nameEn, setNameEn] = useState(initial?.name_i18n.en ?? "");
  const [nameAr, setNameAr] = useState(initial?.name_i18n.ar ?? "");
  const [countryCode, setCountryCode] = useState(initial?.country_code ?? "");
  const [currencyCode, setCurrencyCode] = useState(
    initial?.currency_code ?? tenantCurrency,
  );
  const [leadTimeDays, setLeadTimeDays] = useState<string>(
    initial?.lead_time_days !== null && initial?.lead_time_days !== undefined
      ? String(initial.lead_time_days)
      : "",
  );
  const [paymentTerms, setPaymentTerms] = useState(initial?.payment_terms ?? "");
  const [contactEmail, setContactEmail] = useState(initial?.contact_email ?? "");
  const [contactPhone, setContactPhone] = useState(initial?.contact_phone ?? "");
  const [addressEn, setAddressEn] = useState(initial?.address_i18n?.en ?? "");
  const [addressAr, setAddressAr] = useState(initial?.address_i18n?.ar ?? "");
  const [taxId, setTaxId] = useState(initial?.tax_id ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);

  const [errors, setErrors] = useState<FormErrors>({});
  const [tab, setTab] = useState<"en" | "ar">("en");

  const create = useMutation({
    mutationFn: (body: CreateSupplierBody) => supplierCreateRequest(body),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["suppliers"] });
      window.location.href = `/${locale}/suppliers/${data.id}`;
    },
    onError: (e: unknown) => setErrors(extractErrors(e, t)),
  });

  const update = useMutation({
    mutationFn: (body: UpdateSupplierBody) => supplierUpdateRequest(initial!.id, body),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["suppliers"] });
      window.location.href = `/${locale}/suppliers/${data.id}`;
    },
    onError: (e: unknown) => setErrors(extractErrors(e, t)),
  });

  const saving = create.isPending || update.isPending;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const errs: FormErrors = {};
    if (!isEdit) {
      if (!code.trim()) errs.code = t("errors.required");
      else if (!/^[A-Z0-9_-]{2,16}$/.test(code.trim().toUpperCase())) {
        errs.code = t("errors.codePattern");
      }
    }
    if (!nameEn.trim()) errs.name_en = t("errors.required");
    if (!nameAr.trim()) errs.name_ar = t("errors.required");
    if (contactEmail.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail.trim())) {
      errs.contact_email = t("errors.emailInvalid");
    }
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
        : null;

    const leadInt = leadTimeDays.trim() === "" ? null : Number(leadTimeDays);
    if (
      leadInt !== null &&
      (!Number.isInteger(leadInt) || leadInt < 0)
    ) {
      setErrors({ general: t("errors.validation_failed") });
      return;
    }

    if (isEdit) {
      const body: UpdateSupplierBody = {
        name_i18n: { en: nameEn.trim(), ar: nameAr.trim() },
        country_code: countryCode.trim().toUpperCase() || null,
        currency_code: currencyCode,
        lead_time_days: leadInt,
        payment_terms: paymentTerms.trim() || null,
        contact_email: contactEmail.trim() || null,
        contact_phone: contactPhone.trim() || null,
        address_i18n: addressPayload,
        tax_id: taxId.trim() || null,
        notes: notes.trim() || null,
        is_active: isActive,
      };
      update.mutate(body);
    } else {
      const body: CreateSupplierBody = {
        code: code.trim().toUpperCase(),
        name_i18n: { en: nameEn.trim(), ar: nameAr.trim() },
      };
      const country = countryCode.trim().toUpperCase();
      if (country) body.country_code = country;
      if (currencyCode) body.currency_code = currencyCode;
      if (leadInt !== null) body.lead_time_days = leadInt;
      if (paymentTerms.trim()) body.payment_terms = paymentTerms.trim();
      if (contactEmail.trim()) body.contact_email = contactEmail.trim();
      if (contactPhone.trim()) body.contact_phone = contactPhone.trim();
      if (addressPayload) body.address_i18n = addressPayload;
      if (taxId.trim()) body.tax_id = taxId.trim();
      if (notes.trim()) body.notes = notes.trim();
      create.mutate(body);
    }
  }

  return (
    <div className="sup sup-form-wrap">
      <header style={{ marginBlockEnd: 18 }}>
        <div className="sup-kicker">{isEdit ? t("kickerEdit") : t("kickerCreate")}</div>
        <h1 className="sup-title">{isEdit ? t("titleEdit") : t("titleCreate")}</h1>
      </header>

      {errors.general && <div className="sup-field-error">{errors.general}</div>}

      <form onSubmit={onSubmit}>
        <section className="sup-form-section">
          <h2 className="sup-form-section-title">{t("sections.basics")}</h2>

          <label className="sup-field">
            <span className="sup-field-label">{t("fields.code")}</span>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={16}
              disabled={isEdit}
              autoFocus={!isEdit}
              required={!isEdit}
            />
            <span className="sup-field-hint">
              {isEdit ? t("fields.codeLocked") : t("fields.codeHint")}
            </span>
            {errors.code && <span className="sup-field-error">{errors.code}</span>}
          </label>

          <div className="sup-tab-strip">
            <button type="button" aria-pressed={tab === "en"} onClick={() => setTab("en")}>
              {t("tabs.en")}
            </button>
            <button type="button" aria-pressed={tab === "ar"} onClick={() => setTab("ar")}>
              {t("tabs.ar")}
            </button>
          </div>

          {tab === "en" ? (
            <label className="sup-field">
              <span className="sup-field-label">{t("fields.nameEn")}</span>
              <input
                type="text"
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder={t("fields.namePlaceholder")}
                maxLength={120}
                required
              />
              {errors.name_en && <span className="sup-field-error">{errors.name_en}</span>}
            </label>
          ) : (
            <label className="sup-field" dir="rtl">
              <span className="sup-field-label">{t("fields.nameAr")}</span>
              <input
                type="text"
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                maxLength={120}
                required
              />
              {errors.name_ar && <span className="sup-field-error">{errors.name_ar}</span>}
            </label>
          )}

          <div className="sup-form-row">
            <label className="sup-field">
              <span className="sup-field-label">{t("fields.country")}</span>
              <input
                type="text"
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
                maxLength={2}
                placeholder="EG"
              />
            </label>
            <label className="sup-field">
              <span className="sup-field-label">{t("fields.currency")}</span>
              <select value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)}>
                {[currencyCode, ...COMMON_CURRENCIES.filter((c) => c !== currencyCode)].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="sup-form-section">
          <h2 className="sup-form-section-title">{t("sections.terms")}</h2>
          <div className="sup-form-row">
            <label className="sup-field">
              <span className="sup-field-label">{t("fields.leadTimeDays")}</span>
              <input
                type="number"
                min={0}
                step={1}
                value={leadTimeDays}
                onChange={(e) => setLeadTimeDays(e.target.value)}
              />
            </label>
            <label className="sup-field">
              <span className="sup-field-label">{t("fields.paymentTerms")}</span>
              <input
                type="text"
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                maxLength={120}
                placeholder="Net 30"
              />
              <span className="sup-field-hint">{t("fields.paymentTermsHint")}</span>
            </label>
          </div>
        </section>

        <section className="sup-form-section">
          <h2 className="sup-form-section-title">{t("sections.contact")}</h2>
          <label className="sup-field">
            <span className="sup-field-label">{t("fields.contactEmail")}</span>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              maxLength={200}
            />
            {errors.contact_email && (
              <span className="sup-field-error">{errors.contact_email}</span>
            )}
          </label>
          <label className="sup-field">
            <span className="sup-field-label">{t("fields.contactPhone")}</span>
            <input
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              maxLength={40}
            />
          </label>
        </section>

        <section className="sup-form-section">
          <h2 className="sup-form-section-title">{t("sections.address")}</h2>
          {tab === "en" ? (
            <label className="sup-field">
              <span className="sup-field-label">{t("fields.addressEn")}</span>
              <textarea
                value={addressEn}
                onChange={(e) => setAddressEn(e.target.value)}
                maxLength={500}
              />
            </label>
          ) : (
            <label className="sup-field" dir="rtl">
              <span className="sup-field-label">{t("fields.addressAr")}</span>
              <textarea
                value={addressAr}
                onChange={(e) => setAddressAr(e.target.value)}
                maxLength={500}
              />
            </label>
          )}
        </section>

        <section className="sup-form-section">
          <h2 className="sup-form-section-title">{t("sections.other")}</h2>
          <label className="sup-field">
            <span className="sup-field-label">{t("fields.taxId")}</span>
            <input
              type="text"
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              maxLength={60}
            />
          </label>
          <label className="sup-field">
            <span className="sup-field-label">{t("fields.notes")}</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={2000}
            />
          </label>
        </section>

        {isEdit && (
          <section className="sup-form-section">
            <h2 className="sup-form-section-title">{t("sections.status")}</h2>
            <label className="sup-checkbox">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              <span>{t("fields.isActive")}</span>
            </label>
            <div className="sup-field-hint">{t("fields.isActiveHint")}</div>
          </section>
        )}

        <div className="sup-form-foot">
          <a
            className="sup-btn sup-btn-ghost"
            href={isEdit ? `/${locale}/suppliers/${initial!.id}` : `/${locale}/suppliers`}
          >
            {t("actions.cancel")}
          </a>
          <button type="submit" className="sup-btn sup-btn-primary" disabled={saving}>
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

function extractErrors(err: unknown, t: (k: string) => string): FormErrors {
  if (err instanceof ApiError) {
    if (err.code === "code_taken") return { code: t("errors.code_taken") };
    if (err.code === "validation_failed") {
      const out: FormErrors = { general: t("errors.validation_failed") };
      if (err.fields) {
        if (err.fields.code) out.code = err.fields.code;
        if (err.fields["name_i18n.en"]) out.name_en = err.fields["name_i18n.en"];
        if (err.fields["name_i18n.ar"]) out.name_ar = err.fields["name_i18n.ar"];
        if (err.fields.contact_email) out.contact_email = err.fields.contact_email;
      }
      return out;
    }
    if (err.code === "forbidden_role") return { general: t("errors.forbidden_role") };
    return { general: err.message };
  }
  return { general: t("errors.saveFailed") };
}
