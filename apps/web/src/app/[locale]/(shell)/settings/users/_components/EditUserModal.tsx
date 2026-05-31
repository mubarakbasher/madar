"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { branchesListRequest } from "@/lib/api/branches";
import {
  userUpdateRequest,
  type ApiTenantUser,
  type TenantUserRole,
  type UpdateUserBody,
} from "@/lib/api/users";

interface FormErrors {
  role?: string;
  branch_id?: string;
  is_active?: string;
  general?: string;
}

const ROLES: TenantUserRole[] = ["manager", "cashier", "accountant", "auditor", "owner"];

export function EditUserModal({
  user,
  locale,
  isSelf = false,
  onClose,
}: {
  user: ApiTenantUser;
  locale: "en" | "ar";
  isSelf?: boolean;
  onClose: (updated: ApiTenantUser | null) => void;
}) {
  const t = useTranslations("settings.users");
  const qc = useQueryClient();

  const [role, setRole] = useState<TenantUserRole>(user.role);
  const [branchId, setBranchId] = useState<string>(user.branch_id ?? "");
  const [isActive, setIsActive] = useState<boolean>(user.is_active);
  const [errors, setErrors] = useState<FormErrors>({});

  const branchesQ = useQuery({
    queryKey: ["branches", "list", { include_inactive: false }],
    queryFn: () => branchesListRequest({ include_inactive: false }),
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: (body: UpdateUserBody) => userUpdateRequest(user.id, body),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["users", "list"] });
      onClose(data);
    },
    onError: (e: unknown) => setErrors(extractErrors(e, t)),
  });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const errs: FormErrors = {};
    if (role === "manager" && !branchId) {
      errs.branch_id = t("errors.manager_requires_branch");
    }
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});

    // Send only changed fields; the backend `.refine` requires at least one.
    const body: UpdateUserBody = {};
    if (role !== user.role) body.role = role;
    const nextBranch = branchId || null;
    if (nextBranch !== user.branch_id) body.branch_id = nextBranch;
    if (isActive !== user.is_active) body.is_active = isActive;

    if (Object.keys(body).length === 0) {
      // Nothing changed — close gracefully.
      onClose(null);
      return;
    }
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
          <h2 className="usr-modal-title">{t("editModal.title")}</h2>
          <button
            type="button"
            className="usr-modal-close"
            onClick={() => onClose(null)}
            aria-label={t("editModal.cancel")}
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </header>
        <form onSubmit={onSubmit}>
          <div className="usr-modal-body">
            {errors.general && <div className="usr-general-error">{errors.general}</div>}
            {isSelf && <p className="usr-self-note">{t("editModal.selfBranchNote")}</p>}

            <label className="usr-field">
              <span className="usr-field-label">{t("inviteModal.fields.email")}</span>
              <input type="email" value={user.email} disabled readOnly />
            </label>

            <label className="usr-field">
              <span className="usr-field-label">{t("inviteModal.fields.name")}</span>
              <input type="text" value={user.name} disabled readOnly />
            </label>

            <label className="usr-field">
              <span className="usr-field-label">{t("editModal.fields.role")}</span>
              <select
                value={role}
                disabled={isSelf}
                onChange={(e) => {
                  const next = e.target.value as TenantUserRole;
                  setRole(next);
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
              {errors.role && <span className="usr-field-error">{errors.role}</span>}
            </label>

            <label className="usr-field">
              <span className="usr-field-label">{t("editModal.fields.branch")}</span>
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

            <label className="usr-check" style={{ marginBlockStart: 4 }}>
              <input
                type="checkbox"
                checked={isActive}
                disabled={isSelf}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              <span>{t("editModal.fields.isActive")}</span>
            </label>
          </div>
          <div className="usr-modal-foot">
            <button
              type="button"
              className="usr-btn usr-btn-ghost"
              onClick={() => onClose(null)}
              disabled={mutation.isPending}
            >
              {t("editModal.cancel")}
            </button>
            <button
              type="submit"
              className="usr-btn usr-btn-primary"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "…" : t("editModal.submit")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function extractErrors(err: unknown, t: (k: string) => string): FormErrors {
  if (err instanceof ApiError) {
    if (err.code === "cannot_edit_self") return { general: t("errors.cannot_edit_self") };
    if (err.code === "last_owner_lock") return { general: t("errors.last_owner_lock") };
    if (err.code === "manager_requires_branch") {
      return { branch_id: t("errors.manager_requires_branch") };
    }
    if (err.code === "unknown_branch") return { branch_id: t("errors.unknown_branch") };
    if (err.code === "unknown_user") return { general: t("errors.unknown_user") };
    if (err.code === "forbidden_role") return { general: t("errors.forbidden_role") };
    if (err.code === "validation_failed") {
      const out: FormErrors = { general: t("errors.validation_failed") };
      if (err.fields) {
        if (err.fields.role) out.role = err.fields.role;
        if (err.fields.branch_id) out.branch_id = err.fields.branch_id;
        if (err.fields.is_active) out.is_active = err.fields.is_active;
      }
      return out;
    }
    return { general: err.message };
  }
  return { general: t("errors.generic") };
}
