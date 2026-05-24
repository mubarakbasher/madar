"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { ArrowLeft, Save } from "lucide-react";
import { z } from "zod";
import {
  adminCreatePlan,
  adminGetPlan,
  adminUpdatePlan,
  type PlanResponse,
} from "@/lib/api/admin-plans";
import { ApiError } from "@/lib/api/client";
import { useAdminAuthStore } from "@/lib/auth/store";
import { t } from "@/lib/i18n";

const CURRENCIES = ["USD", "EUR", "GBP", "EGP", "SAR", "AED", "KWD", "JOD", "QAR", "BHD", "OMR", "SDG"] as const;

const LIMIT = z
  .number({ invalid_type_error: "Must be a number" })
  .int("Must be a whole number")
  .min(-1, "Use -1 for unlimited");

const FormSchema = z.object({
  code: z
    .string()
    .min(2, "At least 2 characters")
    .max(32, "At most 32 characters")
    .regex(/^[a-z][a-z0-9_]+$/, "Lowercase letters, digits, underscores; must start with a letter"),
  name_en: z.string().min(1, "English name required").max(80),
  name_ar: z.string().min(1, "Arabic name required").max(80),
  monthly_price_major: z
    .number({ invalid_type_error: "Price required" })
    .min(0, "Cannot be negative")
    .max(100_000, "Too high"),
  currency_code: z.enum(CURRENCIES),
  limit_txns: LIMIT,
  limit_users: LIMIT,
  limit_branches: LIMIT,
  limit_storage_gb: LIMIT,
});

type FormValues = z.infer<typeof FormSchema>;

const BLANK: FormValues = {
  code: "",
  name_en: "",
  name_ar: "",
  monthly_price_major: 49,
  currency_code: "USD",
  limit_txns: 5000,
  limit_users: 5,
  limit_branches: 1,
  limit_storage_gb: 5,
};

function planToForm(p: PlanResponse): FormValues {
  return {
    code: p.code,
    name_en: p.name_i18n.en,
    name_ar: p.name_i18n.ar,
    monthly_price_major: Number(BigInt(p.monthly_price_cents)) / 100,
    currency_code: (CURRENCIES as readonly string[]).includes(p.currency_code)
      ? (p.currency_code as (typeof CURRENCIES)[number])
      : "USD",
    limit_txns: p.limits.txns,
    limit_users: p.limits.users,
    limit_branches: p.limits.branches,
    limit_storage_gb: p.limits.storage_gb,
  };
}

export function PlanEditorClient({ id }: { id: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const user = useAdminAuthStore((s) => s.user);
  const isOwner = user?.role === "owner";
  const isNew = id === "new";

  const query = useQuery<PlanResponse>({
    queryKey: ["admin", "plans", id],
    queryFn: () => adminGetPlan(id),
    enabled: !isNew,
    staleTime: 30_000,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: BLANK,
  });

  useEffect(() => {
    if (!isNew && query.data) {
      form.reset(planToForm(query.data));
    }
  }, [isNew, query.data, form]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const body = {
        name_en: values.name_en,
        name_ar: values.name_ar,
        monthly_price_cents: Math.round(values.monthly_price_major * 100),
        currency_code: values.currency_code,
        limits: {
          txns: values.limit_txns,
          users: values.limit_users,
          branches: values.limit_branches,
          storage_gb: values.limit_storage_gb,
        },
      };
      if (isNew) {
        return adminCreatePlan({ code: values.code, ...body });
      }
      return adminUpdatePlan(id, body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "plans"] });
      router.push("/plans");
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError && err.code === "plan_code_taken") {
        form.setError("code", { message: err.message });
        return;
      }
      if (err instanceof ApiError && err.fields) {
        for (const [field, msg] of Object.entries(err.fields)) {
          form.setError(field as keyof FormValues, { message: msg });
        }
      }
    },
  });

  if (!isOwner) {
    return (
      <div className="admin-error-block">
        {t("plans.editor.ownerOnly")}{" "}
        <Link href="/plans" className="admin-link">
          {t("plans.editor.backToList")}
        </Link>
      </div>
    );
  }

  if (!isNew && query.isPending) {
    return (
      <div className="admin-skeleton-block" aria-busy="true">
        {t("plans.editor.loading")}
      </div>
    );
  }

  if (!isNew && query.isError) {
    return (
      <div className="admin-error-block">
        {t("plans.editor.errorLoad")}{" "}
        <Link href="/plans" className="admin-link">
          {t("plans.editor.backToList")}
        </Link>
      </div>
    );
  }

  const apiError = mutation.error instanceof ApiError ? mutation.error : null;
  const generalError = apiError && !apiError.fields && apiError.code !== "plan_code_taken" ? apiError.message : null;

  return (
    <>
      <header className="admin-page-header">
        <div>
          <Link href="/plans" className="admin-link" style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
            <ArrowLeft size={14} strokeWidth={1.5} />
            <span>{t("plans.editor.allPlans")}</span>
          </Link>
          <h1 className="admin-page-title" style={{ marginTop: 8 }}>
            {isNew ? t("plans.editor.newPlan") : t("plans.editor.editPlan", { code: query.data?.code ?? "plan" })}
          </h1>
        </div>
      </header>

      <form
        className="admin-form"
        onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
        noValidate
      >
        <section className="admin-form-section">
          <h2 className="admin-form-section-title">{t("plans.editor.identity")}</h2>

          <Field label={t("plans.editor.planCode")} hint={isNew ? t("plans.editor.planCodeHintNew") : t("plans.editor.planCodeHintEdit")} error={form.formState.errors.code?.message}>
            <input
              type="text"
              className="admin-input admin-input-mono"
              {...form.register("code")}
              disabled={!isNew}
              placeholder="starter"
              autoComplete="off"
            />
          </Field>

          <Field label={t("plans.editor.englishName")} error={form.formState.errors.name_en?.message}>
            <input type="text" className="admin-input" {...form.register("name_en")} placeholder="Starter" />
          </Field>

          <Field label={t("plans.editor.arabicName")} hint={t("plans.editor.arabicNameHint")} error={form.formState.errors.name_ar?.message}>
            <input type="text" className="admin-input" {...form.register("name_ar")} placeholder="البداية" dir="rtl" />
          </Field>
        </section>

        <section className="admin-form-section">
          <h2 className="admin-form-section-title">{t("plans.editor.price")}</h2>

          <div className="admin-form-row">
            <Field label={t("plans.editor.monthlyPrice")} error={form.formState.errors.monthly_price_major?.message} style={{ flex: 2 }}>
              <input
                type="number"
                step="0.01"
                min="0"
                className="admin-input"
                {...form.register("monthly_price_major", { valueAsNumber: true })}
              />
            </Field>

            <Field label={t("plans.editor.currency")} error={form.formState.errors.currency_code?.message} style={{ flex: 1 }}>
              <select className="admin-input" {...form.register("currency_code")}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </section>

        <section className="admin-form-section">
          <h2 className="admin-form-section-title">{t("plans.editor.limitsTitle")}</h2>
          <p className="admin-form-section-sub">
            {t("plans.editor.limitsHint")}
          </p>

          <div className="admin-form-row">
            <Field label={t("plans.editor.txnsPerMonth")} error={form.formState.errors.limit_txns?.message}>
              <input type="number" step="1" className="admin-input" {...form.register("limit_txns", { valueAsNumber: true })} />
            </Field>
            <Field label={t("plans.editor.users")} error={form.formState.errors.limit_users?.message}>
              <input type="number" step="1" className="admin-input" {...form.register("limit_users", { valueAsNumber: true })} />
            </Field>
          </div>
          <div className="admin-form-row">
            <Field label={t("plans.editor.branches")} error={form.formState.errors.limit_branches?.message}>
              <input type="number" step="1" className="admin-input" {...form.register("limit_branches", { valueAsNumber: true })} />
            </Field>
            <Field label={t("plans.editor.storageGb")} error={form.formState.errors.limit_storage_gb?.message}>
              <input type="number" step="1" className="admin-input" {...form.register("limit_storage_gb", { valueAsNumber: true })} />
            </Field>
          </div>
        </section>

        {generalError ? <div className="admin-error-block">{generalError}</div> : null}

        <div className="admin-form-actions">
          <Link href="/plans" className="admin-btn">
            {t("plans.editor.cancel")}
          </Link>
          <button type="submit" className="admin-btn admin-btn-primary" disabled={mutation.isPending}>
            <Save size={16} strokeWidth={1.75} />
            <span>{mutation.isPending ? t("plans.editor.saving") : isNew ? t("plans.editor.createPlan") : t("plans.editor.saveChanges")}</span>
          </button>
        </div>
      </form>
    </>
  );
}

function Field({
  label,
  hint,
  error,
  children,
  style,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <label className="admin-field" style={style}>
      <span className="admin-field-label">{label}</span>
      {children}
      {hint && !error ? <span className="admin-field-hint">{hint}</span> : null}
      {error ? <span className="admin-field-error">{error}</span> : null}
    </label>
  );
}
