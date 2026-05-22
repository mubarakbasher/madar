"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { branchesListRequest } from "@/lib/api/branches";
import {
  userInviteRequest,
  type ApiTenantUser,
  type InviteUserBody,
  type TenantUserRole,
} from "@/lib/api/users";

interface FormErrors {
  email?: string;
  name?: string;
  role?: string;
  branch_id?: string;
  general?: string;
}

const ROLES: TenantUserRole[] = ["manager", "cashier", "accountant", "auditor", "owner"];

export function InviteUserModal({
  locale,
  onClose,
}: {
  locale: "en" | "ar";
  onClose: (created: ApiTenantUser | null) => void;
}) {
  const t = useTranslations("settings.users");
  const qc = useQueryClient();

  // Default role = manager. Owner is offered but rarely the right pick from
  // an invite flow; we don't strip it because the backend permits it.
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<TenantUserRole>("manager");
  const [branchId, setBranchId] = useState<string>("");
  const [errors, setErrors] = useState<FormErrors>({});

  // Active branches only — listing inactive ones in an invite flow would let
  // owners attach a fresh user to a dormant branch.
  const branchesQ = useQuery({
    queryKey: ["branches", "list", { include_inactive: false }],
    queryFn: () => branchesListRequest({ include_inactive: false }),
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: (body: InviteUserBody) => userInviteRequest(body),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["users", "list"] });
      onClose(data);
    },
    onError: (e: unknown) => setErrors(extractErrors(e, t)),
  });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const errs: FormErrors = {};
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = name.trim();
    if (!trimmedEmail) errs.email = t("errors.validation_failed");
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmedEmail)) {
      errs.email = t("errors.validation_failed");
    }
    if (!trimmedName) errs.name = t("errors.validation_failed");
    if (role === "manager" && !branchId) {
      errs.branch_id = t("errors.manager_requires_branch");
    }
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});

    const body: InviteUserBody = {
      email: trimmedEmail,
      name: trimmedName,
      role,
      branch_id: branchId || null,
    };
    mutation.mutate(body);
  }

  const branches = branchesQ.data?.items ?? [];

  return (
    <div
      role="dialog"
      aria-modal
      className="usr-modal-backdrop"
      onClick={() => onClose(null)}
    >
      <div className="usr-modal" onClick={(e) => e.stopPropagation()}>
        <header className="usr-modal-head">
          <h2 className="usr-modal-title">{t("inviteModal.title")}</h2>
          <button
            type="button"
            className="usr-modal-close"
            onClick={() => onClose(null)}
            aria-label={t("inviteModal.cancel")}
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </header>
        <form onSubmit={onSubmit}>
          <div className="usr-modal-body">
            {errors.general && <div className="usr-general-error">{errors.general}</div>}

            <label className="usr-field">
              <span className="usr-field-label">{t("inviteModal.fields.email")}</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                maxLength={254}
                required
              />
              {errors.email && <span className="usr-field-error">{errors.email}</span>}
            </label>

            <label className="usr-field">
              <span className="usr-field-label">{t("inviteModal.fields.name")}</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                required
              />
              {errors.name && <span className="usr-field-error">{errors.name}</span>}
            </label>

            <label className="usr-field">
              <span className="usr-field-label">{t("inviteModal.fields.role")}</span>
              <select
                value={role}
                onChange={(e) => {
                  const next = e.target.value as TenantUserRole;
                  setRole(next);
                  // When switching away from manager, leave the branch as-is —
                  // the backend treats any non-manager + branch_id combo as
                  // valid (optional branch assignment). Clearing the error if
                  // it was about the missing branch:
                  if (next !== "manager" && errors.branch_id) {
                    setErrors((prev) => ({ ...prev, branch_id: undefined }));
                  }
                }}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(`roles.${r}`)}
                  </option>
                ))}
              </select>
            </label>

            <label className="usr-field">
              <span className="usr-field-label">{t("inviteModal.fields.branch")}</span>
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                disabled={branchesQ.isPending}
              >
                <option value="">{t("inviteModal.fields.branchPlaceholder")}</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name_i18n?.[locale] || b.code}
                  </option>
                ))}
              </select>
              {errors.branch_id && (
                <span className="usr-field-error">{errors.branch_id}</span>
              )}
            </label>
          </div>
          <div className="usr-modal-foot">
            <button
              type="button"
              className="usr-btn usr-btn-ghost"
              onClick={() => onClose(null)}
              disabled={mutation.isPending}
            >
              {t("inviteModal.cancel")}
            </button>
            <button
              type="submit"
              className="usr-btn usr-btn-primary"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "…" : t("inviteModal.submit")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function extractErrors(err: unknown, t: (k: string) => string): FormErrors {
  if (err instanceof ApiError) {
    if (err.code === "email_taken") return { email: t("errors.email_taken") };
    if (err.code === "manager_requires_branch") {
      return { branch_id: t("errors.manager_requires_branch") };
    }
    if (err.code === "unknown_branch") return { branch_id: t("errors.unknown_branch") };
    if (err.code === "forbidden_role") return { general: t("errors.forbidden_role") };
    if (err.code === "validation_failed") {
      const out: FormErrors = { general: t("errors.validation_failed") };
      if (err.fields) {
        if (err.fields.email) out.email = err.fields.email;
        if (err.fields.name) out.name = err.fields.name;
        if (err.fields.role) out.role = err.fields.role;
        if (err.fields.branch_id) out.branch_id = err.fields.branch_id;
      }
      return out;
    }
    return { general: err.message };
  }
  return { general: t("errors.generic") };
}
