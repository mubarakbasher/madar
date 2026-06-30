"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "../../../../../../i18n/routing";
import { ApiError } from "@/lib/api/client";
import { assetCreateRequest, assetUpdateRequest, type ApiFixedAsset } from "@/lib/api/assets";
import { branchesListRequest } from "@/lib/api/branches";

type FormErrors = Partial<
  Record<"nameEn" | "nameAr" | "branch" | "quantity" | "notes" | "general", string>
>;

export function AssetForm({
  asset,
  mode,
  locale,
}: {
  asset?: ApiFixedAsset;
  mode: "create" | "edit";
  locale: "en" | "ar";
}) {
  const t = useTranslations("assets");
  const tErr = useTranslations("assets.errors");
  const router = useRouter();

  const branchesQ = useQuery({
    queryKey: ["branches"],
    queryFn: () => branchesListRequest(),
    staleTime: 60_000,
  });
  const branches = branchesQ.data?.items ?? [];

  const [nameEn, setNameEn] = useState(asset?.name_i18n.en ?? "");
  const [nameAr, setNameAr] = useState(asset?.name_i18n.ar ?? "");
  const [branchId, setBranchId] = useState(asset?.branch_id ?? "");
  const [quantity, setQuantity] = useState<string>(String(asset?.quantity ?? 0));
  const [notes, setNotes] = useState(asset?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  function validate(): boolean {
    const next: FormErrors = {};
    if (!nameEn.trim()) next.nameEn = t("form.errors.nameRequired");
    if (!nameAr.trim()) next.nameAr = t("form.errors.nameRequired");
    if (!branchId) next.branch = t("form.errors.branchRequired");
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 0) next.quantity = t("form.errors.quantityInvalid");
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setErrors({});

    const body = {
      branch_id: branchId,
      name_i18n: { en: nameEn.trim(), ar: nameAr.trim() },
      quantity: Number(quantity),
      notes: notes.trim() || null,
    };

    try {
      if (mode === "create") {
        await assetCreateRequest(body);
      } else {
        await assetUpdateRequest(asset!.id, body);
      }
      router.push("/assets");
    } catch (err) {
      const next: FormErrors = {};
      if (err instanceof ApiError) {
        if (err.code === "asset_exists") next.general = tErr("assetExists");
        else if (err.code === "unknown_branch") next.branch = tErr("unknownBranch");
        else if (err.code === "forbidden_role") next.general = tErr("forbiddenRole");
        else if (err.code === "validation_failed") next.general = tErr("validationFailed");
        else next.general = err.message ?? tErr("generic");
      } else {
        next.general = tErr("network");
      }
      setErrors(next);
      setSubmitting(false);
    }
  }

  return (
    <form className="as-form" onSubmit={onSubmit}>
      {errors.general && <div className="as-form-error">{errors.general}</div>}

      <div className="as-field-row">
        <div className="as-field">
          <label className="as-field-label as-field-required" htmlFor="as-name-en">
            {t("form.nameEn")}
          </label>
          <input
            id="as-name-en"
            className="as-input"
            value={nameEn}
            onChange={(e) => setNameEn(e.target.value)}
            maxLength={160}
            required
          />
          {errors.nameEn && <div className="as-field-error">{errors.nameEn}</div>}
        </div>

        <div className="as-field">
          <label className="as-field-label as-field-required" htmlFor="as-name-ar">
            {t("form.nameAr")}
          </label>
          <input
            id="as-name-ar"
            className="as-input"
            value={nameAr}
            onChange={(e) => setNameAr(e.target.value)}
            maxLength={160}
            dir="rtl"
            required
          />
          {errors.nameAr && <div className="as-field-error">{errors.nameAr}</div>}
        </div>
      </div>

      <div className="as-field-row">
        <div className="as-field">
          <label className="as-field-label as-field-required" htmlFor="as-branch">
            {t("form.branch")}
          </label>
          <select
            id="as-branch"
            className="as-select"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            required
          >
            <option value="" disabled>
              {t("form.branchPlaceholder")}
            </option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name_i18n[locale] || b.name_i18n.en}
              </option>
            ))}
          </select>
          {errors.branch && <div className="as-field-error">{errors.branch}</div>}
        </div>

        <div className="as-field">
          <label className="as-field-label as-field-required" htmlFor="as-quantity">
            {t("form.quantity")}
          </label>
          <input
            id="as-quantity"
            className="as-input"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            required
          />
          {errors.quantity && <div className="as-field-error">{errors.quantity}</div>}
        </div>
      </div>

      <div className="as-field">
        <label className="as-field-label" htmlFor="as-notes">
          {t("form.notes")}
        </label>
        <textarea
          id="as-notes"
          className="as-textarea"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={500}
        />
        {errors.notes && <div className="as-field-error">{errors.notes}</div>}
      </div>

      <div className="as-form-footer">
        <button
          type="button"
          className="as-btn"
          disabled={submitting}
          onClick={() => router.back()}
        >
          {t("form.cancel")}
        </button>
        <button type="submit" className="as-btn as-btn-primary" disabled={submitting}>
          {submitting ? t("form.saving") : mode === "create" ? t("form.create") : t("form.save")}
        </button>
      </div>
    </form>
  );
}
