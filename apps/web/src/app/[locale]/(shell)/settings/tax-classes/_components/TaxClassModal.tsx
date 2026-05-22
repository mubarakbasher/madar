"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import {
  taxClassCreateRequest,
  taxClassUpdateRequest,
  type ApiTaxClass,
  type CreateTaxClassBody,
  type UpdateTaxClassBody,
} from "@/lib/api/tax-classes";

interface FormErrors {
  code?: string;
  name_en?: string;
  name_ar?: string;
  rate_percent?: string;
  general?: string;
}

export function TaxClassModal({
  initial,
  onClose,
}: {
  initial: ApiTaxClass | null;
  onClose: (saved: ApiTaxClass | null) => void;
}) {
  const t = useTranslations("settings.taxClasses");
  const qc = useQueryClient();
  const mode: "create" | "edit" = initial ? "edit" : "create";

  const [code, setCode] = useState(initial?.code ?? "");
  const [nameEn, setNameEn] = useState(initial?.name_i18n?.en ?? "");
  const [nameAr, setNameAr] = useState(initial?.name_i18n?.ar ?? "");
  const [ratePercent, setRatePercent] = useState(
    initial ? (initial.rate_bps / 100).toString() : "",
  );
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [errors, setErrors] = useState<FormErrors>({});

  const createM = useMutation({
    mutationFn: (body: CreateTaxClassBody) => taxClassCreateRequest(body),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["tax-classes", "list"] });
      onClose(data);
    },
    onError: (e: unknown) => setErrors(extractErrors(e, t)),
  });

  const updateM = useMutation({
    mutationFn: (body: UpdateTaxClassBody) =>
      taxClassUpdateRequest(initial!.id, body),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["tax-classes", "list"] });
      onClose(data);
    },
    onError: (e: unknown) => setErrors(extractErrors(e, t)),
  });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const errs: FormErrors = {};
    const trimmedCode = code.trim().toUpperCase();
    const trimmedEn = nameEn.trim();
    const trimmedAr = nameAr.trim();
    const ratePercentNum = Number(ratePercent);

    if (mode === "create" && (!trimmedCode || !/^[A-Z0-9_-]{2,24}$/.test(trimmedCode))) {
      errs.code = t("errors.validation_failed");
    }
    if (!trimmedEn) errs.name_en = t("errors.validation_failed");
    if (!trimmedAr) errs.name_ar = t("errors.validation_failed");
    if (
      !Number.isFinite(ratePercentNum) ||
      ratePercentNum < 0 ||
      ratePercentNum > 1000
    ) {
      errs.rate_percent = t("errors.validation_failed");
    }
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});

    // Percent → basis points (1% = 100 bps). Round to integer.
    const rate_bps = Math.round(ratePercentNum * 100);

    if (mode === "create") {
      createM.mutate({
        code: trimmedCode,
        name_i18n: { en: trimmedEn, ar: trimmedAr },
        rate_bps,
        is_active: isActive,
      });
    } else {
      const body: UpdateTaxClassBody = {};
      if (trimmedEn !== initial!.name_i18n.en || trimmedAr !== initial!.name_i18n.ar) {
        body.name_i18n = { en: trimmedEn, ar: trimmedAr };
      }
      if (rate_bps !== initial!.rate_bps) body.rate_bps = rate_bps;
      if (isActive !== initial!.is_active) body.is_active = isActive;
      if (Object.keys(body).length === 0) {
        onClose(null);
        return;
      }
      updateM.mutate(body);
    }
  }

  const busy = createM.isPending || updateM.isPending;

  return (
    <div
      role="dialog"
      aria-modal
      className="tcl-modal-backdrop"
      onClick={() => onClose(null)}
    >
      <div className="tcl-modal" onClick={(e) => e.stopPropagation()}>
        <header className="tcl-modal-head">
          <h2 className="tcl-modal-title">
            {mode === "create" ? t("modal.create.title") : t("modal.edit.title")}
          </h2>
          <button
            type="button"
            className="tcl-modal-close"
            onClick={() => onClose(null)}
            aria-label={t("modal.cancel")}
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </header>
        <form onSubmit={onSubmit}>
          <div className="tcl-modal-body">
            {errors.general && <div className="tcl-general-error">{errors.general}</div>}

            <label className="tcl-field">
              <span className="tcl-field-label">{t("modal.fields.code")}</span>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                disabled={mode === "edit"}
                maxLength={24}
                placeholder="VAT-15"
                autoFocus={mode === "create"}
                required
              />
              {errors.code && <span className="tcl-field-error">{errors.code}</span>}
            </label>

            <div className="tcl-field-row">
              <label className="tcl-field">
                <span className="tcl-field-label">{t("modal.fields.nameEn")}</span>
                <input
                  type="text"
                  value={nameEn}
                  onChange={(e) => setNameEn(e.target.value)}
                  maxLength={120}
                  required
                />
                {errors.name_en && (
                  <span className="tcl-field-error">{errors.name_en}</span>
                )}
              </label>

              <label className="tcl-field">
                <span className="tcl-field-label">{t("modal.fields.nameAr")}</span>
                <input
                  type="text"
                  value={nameAr}
                  onChange={(e) => setNameAr(e.target.value)}
                  maxLength={120}
                  dir="rtl"
                  required
                />
                {errors.name_ar && (
                  <span className="tcl-field-error">{errors.name_ar}</span>
                )}
              </label>
            </div>

            <label className="tcl-field">
              <span className="tcl-field-label">{t("modal.fields.ratePercent")}</span>
              <input
                type="number"
                step="0.01"
                min="0"
                max="1000"
                value={ratePercent}
                onChange={(e) => setRatePercent(e.target.value)}
                placeholder="15"
                required
              />
              <span className="tcl-field-hint">{t("taxRateHint")}</span>
              {errors.rate_percent && (
                <span className="tcl-field-error">{errors.rate_percent}</span>
              )}
            </label>

            <label className="tcl-check">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              {t("modal.fields.isActive")}
            </label>
          </div>
          <div className="tcl-modal-foot">
            <button
              type="button"
              className="tcl-btn tcl-btn-ghost"
              onClick={() => onClose(null)}
              disabled={busy}
            >
              {t("modal.cancel")}
            </button>
            <button
              type="submit"
              className="tcl-btn tcl-btn-primary"
              disabled={busy}
            >
              {busy ? "…" : t("modal.submit")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function extractErrors(
  err: unknown,
  t: (k: string) => string,
): FormErrors {
  if (err instanceof ApiError) {
    if (err.code === "tax_class_code_taken") {
      return { code: t("errors.tax_class_code_taken") };
    }
    if (err.code === "forbidden_role") return { general: t("errors.forbidden_role") };
    if (err.code === "validation_failed") {
      const out: FormErrors = { general: t("errors.validation_failed") };
      if (err.fields) {
        if (err.fields.code) out.code = err.fields.code;
        if (err.fields["name_i18n.en"]) out.name_en = err.fields["name_i18n.en"];
        if (err.fields["name_i18n.ar"]) out.name_ar = err.fields["name_i18n.ar"];
        if (err.fields.rate_bps) out.rate_percent = err.fields.rate_bps;
      }
      return out;
    }
    return { general: err.message };
  }
  return { general: t("errors.generic") };
}
