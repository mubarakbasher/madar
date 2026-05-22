"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "../../../../../../i18n/routing";
import { ApiError } from "@/lib/api/client";
import {
  customerCreateRequest,
  customerUpdateRequest,
  type ApiCustomerDetail,
} from "@/lib/api/customers";

type FormErrors = Partial<Record<"name" | "phone" | "email" | "notes" | "code" | "general", string>>;

export function CustomerForm({
  customer,
  mode,
}: {
  customer?: ApiCustomerDetail;
  mode: "create" | "edit";
}) {
  const t = useTranslations("customers");
  const tCommon = useTranslations("customers.errors");
  const router = useRouter();

  const [name, setName] = useState(customer?.name ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [notes, setNotes] = useState(customer?.notes ?? "");
  const [code, setCode] = useState(customer?.code ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  function validate(): boolean {
    const next: FormErrors = {};
    if (!name.trim()) next.name = t("form.errors.nameRequired");
    if (email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      next.email = t("form.errors.emailInvalid");
    }
    if (code.trim() && !/^[A-Z0-9_-]+$/.test(code.trim().toUpperCase())) {
      next.code = t("form.errors.codeInvalid");
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setErrors({});

    const body = {
      name: name.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
      notes: notes.trim() || null,
      code: code.trim() || null,
    };

    try {
      const saved =
        mode === "create"
          ? await customerCreateRequest(body)
          : await customerUpdateRequest(customer!.id, body);
      router.push(`/customers/${saved.id}`);
    } catch (err) {
      const next: FormErrors = {};
      if (err instanceof ApiError) {
        if (err.code === "email_taken") next.email = tCommon("emailTaken");
        else if (err.code === "phone_taken") next.phone = tCommon("phoneTaken");
        else if (err.code === "forbidden_role") next.general = tCommon("forbiddenRole");
        else if (err.code === "validation_failed") next.general = tCommon("validationFailed");
        else next.general = err.message ?? tCommon("generic");
      } else {
        next.general = tCommon("network");
      }
      setErrors(next);
      setSubmitting(false);
    }
  }

  return (
    <form className="cu-form" onSubmit={onSubmit}>
      {errors.general && <div className="cu-form-error">{errors.general}</div>}

      <div className="cu-field">
        <label className="cu-field-label cu-field-required" htmlFor="cu-name">
          {t("form.name")}
        </label>
        <input
          id="cu-name"
          className="cu-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          required
        />
        {errors.name && <div className="cu-field-error">{errors.name}</div>}
      </div>

      <div className="cu-field">
        <label className="cu-field-label" htmlFor="cu-phone">
          {t("form.phone")}
        </label>
        <input
          id="cu-phone"
          className="cu-input"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          maxLength={40}
          type="tel"
        />
        {errors.phone && <div className="cu-field-error">{errors.phone}</div>}
      </div>

      <div className="cu-field">
        <label className="cu-field-label" htmlFor="cu-email">
          {t("form.email")}
        </label>
        <input
          id="cu-email"
          className="cu-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={255}
          type="email"
        />
        {errors.email && <div className="cu-field-error">{errors.email}</div>}
      </div>

      <div className="cu-field">
        <label className="cu-field-label" htmlFor="cu-code">
          {t("form.code")}
        </label>
        <input
          id="cu-code"
          className="cu-input"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={32}
          style={{ fontFamily: "var(--font-mono, monospace)" }}
        />
        <div className="cu-muted" style={{ fontSize: 12, marginBlockStart: 4 }}>
          {t("form.codeHelp")}
        </div>
        {errors.code && <div className="cu-field-error">{errors.code}</div>}
      </div>

      <div className="cu-field">
        <label className="cu-field-label" htmlFor="cu-notes">
          {t("form.notes")}
        </label>
        <textarea
          id="cu-notes"
          className="cu-textarea"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={2000}
        />
        {errors.notes && <div className="cu-field-error">{errors.notes}</div>}
      </div>

      <div className="cu-form-footer">
        <button
          type="button"
          className="cu-btn"
          disabled={submitting}
          onClick={() => router.back()}
        >
          {t("form.cancel")}
        </button>
        <button type="submit" className="cu-btn cu-btn-primary" disabled={submitting}>
          {submitting
            ? t("form.saving")
            : mode === "create"
              ? t("form.create")
              : t("form.save")}
        </button>
      </div>
    </form>
  );
}
