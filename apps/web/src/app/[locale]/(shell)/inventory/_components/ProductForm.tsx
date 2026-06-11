"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, ImageIcon, Plus, Trash2, Upload, X } from "lucide-react";
import { useRouter } from "../../../../../../i18n/routing";
import {
  branchesListRequest,
  categoriesListRequest,
  productClearImageRequest,
  productCreateRequest,
  productImagePublicUrl,
  productSetImageRequest,
  productUpdateRequest,
  type ApiBranch,
  type ApiCategory,
  type ApiProduct,
  type CreateProductBody,
  type ProductInitialStockEntry,
  type UpdateProductBody,
} from "@/lib/api/catalog";
import { taxClassesListRequest, type ApiTaxClass } from "@/lib/api/tax-classes";
import { ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/store";
import { currencyMinorUnits, majorToMinor, minorToMajor } from "@/lib/currency";

type Mode = "create" | "edit";

interface FormState {
  sku: string;
  name_en: string;
  name_ar: string;
  description_en: string;
  description_ar: string;
  category_id: string;
  tax_class_id: string;
  price_major: string;
  cost_major: string;
  currency_code: string;
  barcode: string;
  is_active: boolean;
  initial_stock: Array<ProductInitialStockEntry & { _key: string }>;
}

function centsToMajor(cents: string, currencyCode: string): string {
  return minorToMajor(cents, currencyCode).toFixed(currencyMinorUnits(currencyCode));
}

function majorToCents(major: string, currencyCode: string): number {
  const trimmed = major.trim();
  if (!trimmed) return 0;
  const n = majorToMinor(Number(trimmed), currencyCode);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

export function ProductForm({
  mode,
  product,
  defaultCurrencyCode,
}: {
  mode: Mode;
  product?: ApiProduct;
  defaultCurrencyCode: string;
}) {
  const t = useTranslations("inventory.form");
  const tc = useTranslations("auth.common");
  const locale = useLocale();
  const router = useRouter();
  const qc = useQueryClient();
  const tenant = useAuthStore((s) => s.tenant);
  const [activeLang, setActiveLang] = useState<"en" | "ar">(locale === "ar" ? "ar" : "en");
  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Image state.
  // Create flow: pendingImageFile is held until product is created, then uploaded.
  // Edit flow: image mutations fire immediately (replace/remove) via the buttons.
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [pendingImagePreview, setPendingImagePreview] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [currentProductImage, setCurrentProductImage] = useState<string | null>(
    product?.image_url ?? null,
  );
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (!pendingImageFile) {
      setPendingImagePreview(null);
      return;
    }
    const url = URL.createObjectURL(pendingImageFile);
    setPendingImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingImageFile]);

  const initial: FormState = useMemo(
    () => ({
      sku: product?.sku ?? "",
      name_en: product?.name_i18n.en ?? "",
      name_ar: product?.name_i18n.ar ?? "",
      description_en: product?.description_i18n?.en ?? "",
      description_ar: product?.description_i18n?.ar ?? "",
      category_id: product?.category_id ?? "",
      tax_class_id: product?.tax_class_id ?? "",
      price_major: product ? centsToMajor(product.price_cents, product.currency_code) : "",
      cost_major: product ? centsToMajor(product.cost_cents, product.currency_code) : "",
      currency_code: product?.currency_code ?? defaultCurrencyCode,
      barcode: product?.barcode ?? "",
      is_active: product?.is_active ?? true,
      initial_stock: [],
    }),
    [product, defaultCurrencyCode],
  );

  const [form, setForm] = useState<FormState>(initial);
  useEffect(() => setForm(initial), [initial]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((e) => {
      if (!e[String(key)]) return e;
      const next = { ...e };
      delete next[String(key)];
      return next;
    });
  };

  const categoriesQ = useQuery({
    queryKey: ["catalog", "categories"],
    queryFn: () => categoriesListRequest(),
    staleTime: 60_000,
  });

  // Active tax classes only — inactive ones shouldn't be attachable.
  const taxClassesQ = useQuery({
    queryKey: ["tax-classes", "list", { active_only: true }],
    queryFn: () => taxClassesListRequest({ active_only: true, limit: 100 }),
    staleTime: 60_000,
  });

  const branchesQ = useQuery({
    queryKey: ["branches"],
    queryFn: () => branchesListRequest(),
    staleTime: 60_000,
    enabled: mode === "create",
  });

  const createMutation = useMutation({
    mutationFn: (body: CreateProductBody) => productCreateRequest(body),
    onSuccess: async (createdProduct) => {
      // If the user attached an image during creation, upload it now. A
      // failed image upload doesn't roll back the product — the user can
      // re-attach from the edit page.
      if (pendingImageFile) {
        try {
          await productSetImageRequest(createdProduct.id, pendingImageFile);
        } catch (err) {
          // Surface the failure but still navigate — the product exists.
          if (err instanceof ApiError) setServerError(t("image.uploadFailed", { reason: err.message }));
        }
      }
      qc.invalidateQueries({ queryKey: ["catalog"] });
      router.push("/inventory");
    },
    onError: handleApiError,
  });

  const updateMutation = useMutation({
    mutationFn: (body: UpdateProductBody) =>
      productUpdateRequest(product!.id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["catalog"] });
      router.push("/inventory");
    },
    onError: handleApiError,
  });

  function handleApiError(err: unknown) {
    if (err instanceof ApiError) {
      if (err.fields) setFieldErrors(err.fields);
      setServerError(err.message);
    } else {
      setServerError(t("errors.network"));
    }
  }

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {};
    if (mode === "create" && !form.sku.trim()) errs.sku = t("errors.required");
    if (form.sku && !/^[A-Z0-9-]+$/.test(form.sku)) errs.sku = t("errors.skuFormat");
    if (!form.name_en.trim()) errs.name_en = t("errors.required");
    if (!form.name_ar.trim()) errs.name_ar = t("errors.required");
    if (mode === "create" && !form.price_major.trim()) errs.price_major = t("errors.required");
    if (mode === "create" && !form.cost_major.trim()) errs.cost_major = t("errors.required");
    return errs;
  }

  function buildCreateBody(): CreateProductBody {
    return {
      sku: form.sku.trim(),
      name_i18n: { en: form.name_en.trim(), ar: form.name_ar.trim() },
      description_i18n:
        form.description_en.trim() || form.description_ar.trim()
          ? {
              ...(form.description_en.trim() ? { en: form.description_en.trim() } : {}),
              ...(form.description_ar.trim() ? { ar: form.description_ar.trim() } : {}),
            }
          : null,
      category_id: form.category_id || null,
      tax_class_id: form.tax_class_id || null,
      price_cents: majorToCents(form.price_major, form.currency_code),
      cost_cents: majorToCents(form.cost_major, form.currency_code),
      currency_code: form.currency_code.toUpperCase(),
      barcode: form.barcode.trim() || null,
      is_active: form.is_active,
      initial_stock: form.initial_stock
        .filter((e) => e.branch_id && e.qty >= 0)
        .map(({ _key, ...rest }) => rest),
    };
  }

  function buildPatchBody(): UpdateProductBody {
    if (!product) return {};
    const body: UpdateProductBody = {};
    if (form.sku.trim() !== product.sku) body.sku = form.sku.trim();
    if (form.name_en.trim() !== product.name_i18n.en || form.name_ar.trim() !== product.name_i18n.ar) {
      body.name_i18n = { en: form.name_en.trim(), ar: form.name_ar.trim() };
    }
    const descChanged =
      form.description_en.trim() !== (product.description_i18n?.en ?? "") ||
      form.description_ar.trim() !== (product.description_i18n?.ar ?? "");
    if (descChanged) {
      body.description_i18n =
        form.description_en.trim() || form.description_ar.trim()
          ? {
              ...(form.description_en.trim() ? { en: form.description_en.trim() } : {}),
              ...(form.description_ar.trim() ? { ar: form.description_ar.trim() } : {}),
            }
          : null;
    }
    if ((form.category_id || null) !== product.category_id) body.category_id = form.category_id || null;
    if ((form.tax_class_id || null) !== product.tax_class_id) body.tax_class_id = form.tax_class_id || null;
    const priceCents = majorToCents(form.price_major, form.currency_code);
    if (priceCents !== Number(BigInt(product.price_cents))) body.price_cents = priceCents;
    const costCents = majorToCents(form.cost_major, form.currency_code);
    if (costCents !== Number(BigInt(product.cost_cents))) body.cost_cents = costCents;
    if (form.currency_code.toUpperCase() !== product.currency_code) {
      body.currency_code = form.currency_code.toUpperCase();
    }
    if ((form.barcode.trim() || null) !== product.barcode) body.barcode = form.barcode.trim() || null;
    if (form.is_active !== product.is_active) body.is_active = form.is_active;
    return body;
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }
    if (mode === "create") {
      createMutation.mutate(buildCreateBody());
    } else {
      const patch = buildPatchBody();
      if (Object.keys(patch).length === 0) {
        router.push("/inventory");
        return;
      }
      updateMutation.mutate(patch);
    }
  }

  const submitting = createMutation.isPending || updateMutation.isPending;
  const categories: ApiCategory[] = categoriesQ.data?.items ?? [];
  const branches: ApiBranch[] = branchesQ.data?.items ?? [];

  const margin = useMemo(() => {
    const p = Number(form.price_major);
    const c = Number(form.cost_major);
    if (!Number.isFinite(p) || !Number.isFinite(c) || p <= 0) return null;
    return Math.round(((p - c) / p) * 100);
  }, [form.price_major, form.cost_major]);

  const imageDisplayUrl = useMemo(() => {
    if (!product || !tenant) return null;
    return productImagePublicUrl(tenant.id, product.id, currentProductImage);
  }, [product, tenant, currentProductImage]);

  return (
    <div style={{ paddingBlock: "32px 96px", maxWidth: 920, marginInline: "auto" }}>
      <div style={{ marginBottom: 24 }}>
        <button
          type="button"
          onClick={() => router.push("/inventory")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: "var(--ink-3)",
            fontSize: 13,
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
        >
          <ArrowLeft size={14} strokeWidth={1.5} className="rtl:rotate-180" />
          {t("backToInventory")}
        </button>
        <h1
          style={{
            fontFamily: "var(--serif)",
            fontSize: 36,
            letterSpacing: "-0.02em",
            lineHeight: 1.15,
            marginTop: 12,
          }}
        >
          {mode === "create" ? t("createTitle") : t("editTitle")}
        </h1>
        <p style={{ color: "var(--ink-3)", fontSize: 14, marginTop: 8 }}>
          {mode === "create" ? t("createSubtitle") : t("editSubtitle")}
        </p>
      </div>

      <form onSubmit={onSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Image ─────────────────────────────────────────── */}
        <Section title={t("image.section")}>
          <ImageBlock
            previewUrl={pendingImagePreview ?? imageDisplayUrl}
            hasImage={Boolean(pendingImagePreview ?? currentProductImage)}
            busy={imageBusy}
            t={t}
            onPick={() => imageInputRef.current?.click()}
            onRemove={async () => {
              if (mode === "create") {
                setPendingImageFile(null);
                return;
              }
              if (!product) return;
              setImageBusy(true);
              try {
                const updated = await productClearImageRequest(product.id);
                setCurrentProductImage(updated.image_url ?? null);
                qc.invalidateQueries({ queryKey: ["catalog"] });
              } catch (err) {
                if (err instanceof ApiError) setServerError(err.message);
              } finally {
                setImageBusy(false);
              }
            }}
          />
          <input
            ref={imageInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: "none" }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              if (file.size > 5 * 1024 * 1024) {
                setServerError(t("image.tooLarge"));
                return;
              }
              if (mode === "create") {
                setPendingImageFile(file);
                return;
              }
              if (!product) return;
              setImageBusy(true);
              try {
                const updated = await productSetImageRequest(product.id, file);
                setCurrentProductImage(updated.image_url ?? null);
                qc.invalidateQueries({ queryKey: ["catalog"] });
              } catch (err) {
                if (err instanceof ApiError) setServerError(err.message);
                else setServerError(t("image.uploadFailed", { reason: "" }));
              } finally {
                setImageBusy(false);
              }
            }}
          />
        </Section>

        {/* Basics ───────────────────────────────────────── */}
        <Section title={t("sections.basics")}>
          <div style={{ marginBottom: 12, display: "inline-flex", border: "1px solid var(--rule)", borderRadius: 999, padding: 2 }}>
            {(["en", "ar"] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setActiveLang(l)}
                style={{
                  padding: "4px 14px",
                  fontSize: 12,
                  borderRadius: 999,
                  background: activeLang === l ? "var(--accent)" : "transparent",
                  color: activeLang === l ? "white" : "var(--ink-3)",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {l === "en" ? "EN" : "ع"}
              </button>
            ))}
          </div>

          {activeLang === "en" ? (
            <>
              <Field
                label={t("fields.nameEn")}
                error={fieldErrors.name_en ?? fieldErrors["name_i18n.en"]}
              >
                <Input value={form.name_en} onChange={(v) => set("name_en", v)} autoFocus />
              </Field>
              <Field label={t("fields.descriptionEn")} optional>
                <Textarea
                  value={form.description_en}
                  onChange={(v) => set("description_en", v)}
                  rows={3}
                />
              </Field>
            </>
          ) : (
            <>
              <Field
                label={t("fields.nameAr")}
                error={fieldErrors.name_ar ?? fieldErrors["name_i18n.ar"]}
              >
                <Input value={form.name_ar} onChange={(v) => set("name_ar", v)} dir="rtl" />
              </Field>
              <Field label={t("fields.descriptionAr")} optional>
                <Textarea
                  value={form.description_ar}
                  onChange={(v) => set("description_ar", v)}
                  dir="rtl"
                  rows={3}
                />
              </Field>
            </>
          )}

          <Field label={t("fields.category")} optional>
            <select
              value={form.category_id}
              onChange={(e) => set("category_id", e.target.value)}
              style={inputStyle()}
            >
              <option value="">{t("fields.categoryNone")}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name_i18n[locale === "ar" ? "ar" : "en"]} ({c.code})
                </option>
              ))}
            </select>
          </Field>

          <TaxClassField
            value={form.tax_class_id}
            onChange={(v) => set("tax_class_id", v)}
            taxClasses={taxClassesQ.data?.items ?? []}
            locale={locale === "ar" ? "ar" : "en"}
          />
        </Section>

        {/* Identification ───────────────────────────────── */}
        <Section title={t("sections.identification")}>
          <Field label={t("fields.sku")} error={fieldErrors.sku}>
            <Input
              value={form.sku}
              onChange={(v) => set("sku", v.toUpperCase())}
              placeholder="BNS-001"
            />
          </Field>
          <Field label={t("fields.barcode")} optional>
            <Input value={form.barcode} onChange={(v) => set("barcode", v)} />
          </Field>
        </Section>

        {/* Pricing ──────────────────────────────────────── */}
        <Section title={t("sections.pricing")}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field
              label={t("fields.priceMajor", { currency: form.currency_code })}
              error={fieldErrors.price_major ?? fieldErrors.price_cents}
            >
              <Input
                value={form.price_major}
                onChange={(v) => set("price_major", v)}
                inputMode="decimal"
                placeholder="0.00"
              />
            </Field>
            <Field
              label={t("fields.costMajor", { currency: form.currency_code })}
              error={fieldErrors.cost_major ?? fieldErrors.cost_cents}
            >
              <Input
                value={form.cost_major}
                onChange={(v) => set("cost_major", v)}
                inputMode="decimal"
                placeholder="0.00"
              />
            </Field>
          </div>
          {margin !== null && (
            <p style={{ marginTop: 8, fontSize: 12, color: "var(--ink-3)" }}>
              {t("marginPreview", { percent: margin })}
            </p>
          )}
        </Section>

        {/* Initial stock (create only) ──────────────────── */}
        {mode === "create" && (
          <Section
            title={t("sections.initialStock")}
            subtitle={t("sections.initialStockSubtitle")}
          >
            {form.initial_stock.length === 0 && (
              <p style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 12 }}>
                {t("initialStock.emptyHint")}
              </p>
            )}
            {form.initial_stock.map((entry, idx) => (
              <div
                key={entry._key}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 1fr 1fr auto",
                  gap: 8,
                  alignItems: "end",
                  marginBottom: 10,
                }}
              >
                <Field label={idx === 0 ? t("initialStock.branch") : ""}>
                  <select
                    value={entry.branch_id}
                    onChange={(e) => {
                      const next = [...form.initial_stock];
                      next[idx] = { ...entry, branch_id: e.target.value };
                      set("initial_stock", next);
                    }}
                    style={inputStyle()}
                  >
                    <option value="">{t("initialStock.selectBranch")}</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name_i18n[locale === "ar" ? "ar" : "en"]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={idx === 0 ? t("initialStock.qty") : ""}>
                  <Input
                    value={String(entry.qty)}
                    onChange={(v) => {
                      const next = [...form.initial_stock];
                      next[idx] = { ...entry, qty: Math.max(0, parseInt(v, 10) || 0) };
                      set("initial_stock", next);
                    }}
                    inputMode="numeric"
                  />
                </Field>
                <Field label={idx === 0 ? t("initialStock.reorderPoint") : ""} optional>
                  <Input
                    value={entry.reorder_point != null ? String(entry.reorder_point) : ""}
                    onChange={(v) => {
                      const next = [...form.initial_stock];
                      const n = parseInt(v, 10);
                      next[idx] = {
                        ...entry,
                        reorder_point: Number.isFinite(n) && n >= 0 ? n : undefined,
                      };
                      set("initial_stock", next);
                    }}
                    inputMode="numeric"
                  />
                </Field>
                <Field label={idx === 0 ? t("initialStock.reorderQty") : ""} optional>
                  <Input
                    value={entry.reorder_qty != null ? String(entry.reorder_qty) : ""}
                    onChange={(v) => {
                      const next = [...form.initial_stock];
                      const n = parseInt(v, 10);
                      next[idx] = {
                        ...entry,
                        reorder_qty: Number.isFinite(n) && n >= 0 ? n : undefined,
                      };
                      set("initial_stock", next);
                    }}
                    inputMode="numeric"
                  />
                </Field>
                <button
                  type="button"
                  aria-label={tc("remove")}
                  onClick={() => {
                    const next = form.initial_stock.filter((_, i) => i !== idx);
                    set("initial_stock", next);
                  }}
                  style={{
                    height: 40,
                    width: 40,
                    background: "transparent",
                    border: "1px solid var(--rule)",
                    borderRadius: 8,
                    color: "var(--ink-3)",
                    cursor: "pointer",
                  }}
                >
                  <Trash2 size={14} strokeWidth={1.5} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => {
                const next = [
                  ...form.initial_stock,
                  {
                    _key: Math.random().toString(36).slice(2),
                    branch_id: "",
                    qty: 0,
                  },
                ];
                set("initial_stock", next);
              }}
              style={{
                marginTop: 4,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 12px",
                fontSize: 13,
                background: "transparent",
                border: "1px dashed var(--rule)",
                borderRadius: 8,
                color: "var(--ink-2)",
                cursor: "pointer",
              }}
            >
              <Plus size={13} strokeWidth={1.5} />
              {t("initialStock.addBranch")}
            </button>
          </Section>
        )}

        {/* Status ────────────────────────────────────────── */}
        <Section title={t("sections.status")}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14 }}>
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => set("is_active", e.target.checked)}
            />
            {t("fields.isActive")}
          </label>
        </Section>

        {serverError && (
          <div
            role="alert"
            style={{
              background: "color-mix(in oklab, var(--rose) 14%, transparent)",
              color: "var(--rose)",
              border: "1px solid color-mix(in oklab, var(--rose) 24%, transparent)",
              padding: "10px 14px",
              borderRadius: 10,
              fontSize: 14,
            }}
          >
            {serverError}
          </div>
        )}

        {/* Footer ───────────────────────────────────────── */}
        <div
          style={{
            position: "sticky",
            bottom: 0,
            background: "var(--bg)",
            borderTop: "1px solid var(--rule)",
            paddingBlock: 16,
            marginTop: 8,
            display: "flex",
            gap: 12,
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            onClick={() => router.push("/inventory")}
            style={{
              height: 44,
              paddingInline: 20,
              borderRadius: 10,
              background: "transparent",
              border: "1px solid var(--rule)",
              color: "var(--ink-2)",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            {t("actions.cancel")}
          </button>
          <button
            type="submit"
            disabled={submitting}
            style={{
              height: 44,
              paddingInline: 24,
              borderRadius: 10,
              background: "var(--accent)",
              color: "white",
              border: "none",
              fontSize: 14,
              fontWeight: 500,
              cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? t("actions.saving") : t("actions.save")}
          </button>
        </div>
      </form>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: "var(--surface)",
        border: "1px solid var(--rule)",
        borderRadius: 16,
        padding: 24,
      }}
    >
      <h2
        style={{
          fontFamily: "var(--serif)",
          fontSize: 18,
          letterSpacing: "-0.01em",
          marginBottom: subtitle ? 4 : 16,
        }}
      >
        {title}
      </h2>
      {subtitle && (
        <p style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 16 }}>{subtitle}</p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>
    </section>
  );
}

function Field({
  label,
  optional,
  error,
  children,
}: {
  label: string;
  optional?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "block" }}>
      {label && (
        <div
          style={{
            marginBottom: 6,
            fontSize: 12,
            color: "var(--ink-3)",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontWeight: 500 }}>{label}</span>
          {optional && <span style={{ fontStyle: "italic" }}>optional</span>}
        </div>
      )}
      {children}
      {error && (
        <div style={{ marginTop: 4, fontSize: 12, color: "var(--rose)" }}>{error}</div>
      )}
    </label>
  );
}

function Input({
  value,
  onChange,
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <input
      {...rest}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...inputStyle(), ...(rest.style ?? {}) }}
    />
  );
}

function Textarea({
  value,
  onChange,
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange">) {
  return (
    <textarea
      {...rest}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        ...inputStyle(),
        resize: "vertical",
        minHeight: 60,
        ...(rest.style ?? {}),
      }}
    />
  );
}

function TaxClassField({
  value,
  onChange,
  taxClasses,
  locale,
}: {
  value: string;
  onChange: (v: string) => void;
  taxClasses: ApiTaxClass[];
  locale: "en" | "ar";
}) {
  const t = useTranslations("inventory.productForm.taxClass");
  return (
    <Field label={t("label")} optional>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle()}
      >
        <option value="">{t("useDefault")}</option>
        {taxClasses.map((tc) => {
          const ratePct = tc.rate_bps / 100;
          const rateLabel = Number.isInteger(ratePct) ? ratePct.toString() : ratePct.toFixed(2);
          return (
            <option key={tc.id} value={tc.id}>
              {(tc.name_i18n[locale] || tc.name_i18n.en)} — {tc.code} ({rateLabel}%)
            </option>
          );
        })}
      </select>
      <p style={{ marginTop: 4, fontSize: 11, color: "var(--ink-3)" }}>{t("hint")}</p>
    </Field>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    width: "100%",
    height: 40,
    padding: "0 12px",
    borderRadius: 8,
    border: "1px solid var(--rule)",
    background: "var(--bg)",
    color: "var(--ink)",
    fontSize: 14,
    fontFamily: "inherit",
    outline: "none",
  };
}

function ImageBlock({
  previewUrl,
  hasImage,
  busy,
  t,
  onPick,
  onRemove,
}: {
  previewUrl: string | null;
  hasImage: boolean;
  busy: boolean;
  t: ReturnType<typeof useTranslations>;
  onPick: () => void;
  onRemove: () => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <div
        style={{
          width: 96,
          height: 96,
          borderRadius: 12,
          border: "1px dashed var(--rule)",
          background: "var(--bg)",
          display: "grid",
          placeItems: "center",
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <ImageIcon size={28} strokeWidth={1.25} style={{ color: "var(--ink-3)" }} />
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={onPick}
            disabled={busy}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              background: "var(--accent)",
              color: "white",
              border: "none",
              fontSize: 13,
              cursor: busy ? "not-allowed" : "pointer",
              opacity: busy ? 0.6 : 1,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Upload size={13} strokeWidth={1.5} />
            {hasImage ? t("image.replace") : t("image.upload")}
          </button>
          {hasImage && (
            <button
              type="button"
              onClick={onRemove}
              disabled={busy}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                background: "transparent",
                border: "1px solid var(--rule)",
                color: "var(--rose)",
                fontSize: 13,
                cursor: busy ? "not-allowed" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <X size={13} strokeWidth={1.5} />
              {t("image.remove")}
            </button>
          )}
        </div>
        <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{t("image.hint")}</span>
      </div>
    </div>
  );
}
