"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import {
  userUpdateRequest,
  usersListRequest,
  type ApiTenantUser,
  type TenantUserRole,
} from "@/lib/api/users";

const ROLE_CLASS: Record<string, string> = {
  owner: "br-role-owner",
  manager: "br-role-manager",
  cashier: "br-role-cashier",
  accountant: "br-role-accountant",
  auditor: "br-role-auditor",
};

function initial(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

export function AssignUserModal({
  branchId,
  branchName,
  locale,
  onClose,
}: {
  branchId: string;
  branchName: string;
  locale: "en" | "ar";
  onClose: () => void;
}) {
  const t = useTranslations("branches.detail.staff.assignModal");
  const tRoles = useTranslations("settings.users.roles");
  const tErr = useTranslations("branches.detail.staff.errors");
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; msg: string } | null>(null);

  const q = useQuery({
    queryKey: ["users", "list", "assignable"],
    queryFn: () => usersListRequest({ active_only: true, limit: 200 }),
    staleTime: 30_000,
  });

  const candidates = useMemo(() => {
    const all = q.data?.items ?? [];
    const not = all.filter((u) => u.branch_id !== branchId);
    const needle = search.trim().toLowerCase();
    if (!needle) return not;
    return not.filter(
      (u) =>
        u.name.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle),
    );
  }, [q.data, branchId, search]);

  const assignMut = useMutation({
    mutationFn: (u: ApiTenantUser) => userUpdateRequest(u.id, { branch_id: branchId }),
    onSuccess: async () => {
      setPendingId(null);
      setRowError(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["branches", "detail", branchId] }),
        qc.invalidateQueries({ queryKey: ["users", "list", "assignable"] }),
      ]);
      onClose();
    },
    onError: (err: unknown, variables) => {
      const code =
        err && typeof err === "object" && "code" in err && typeof err.code === "string"
          ? err.code
          : "network";
      const msg =
        code === "cannot_edit_self"
          ? tErr("cannotEditSelf")
          : code === "last_owner_lock"
            ? tErr("lastOwnerLock")
            : code === "manager_requires_branch"
              ? tErr("managerRequiresBranch")
              : code === "forbidden_role"
                ? tErr("forbiddenRole")
                : tErr("network");
      setRowError({ id: variables.id, msg });
      setPendingId(null);
    },
  });

  const handlePick = (u: ApiTenantUser) => {
    if (pendingId) return;
    setRowError(null);
    setPendingId(u.id);
    assignMut.mutate(u);
  };

  return (
    <div className="br-modal-scrim" onClick={onClose}>
      <div
        className="br-modal br-modal-wide"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="br-modal-head">
          <h3 className="br-modal-title">{t("title", { branch: branchName })}</h3>
          <button
            type="button"
            className="br-modal-close"
            aria-label={t("closeLabel")}
            onClick={onClose}
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <div className="br-modal-search">
          <Search size={14} strokeWidth={1.5} aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            autoFocus
          />
        </div>

        {q.isPending && <p className="br-modal-status">{t("loading")}</p>}
        {q.isError && (
          <p className="br-modal-status br-modal-error">
            {t("loadFailed")}
            <button
              type="button"
              className="br-link"
              onClick={() => void q.refetch()}
              style={{ marginInlineStart: 8 }}
            >
              {t("retry")}
            </button>
          </p>
        )}
        {q.isSuccess && candidates.length === 0 && (
          <p className="br-modal-status">{t("emptyResults")}</p>
        )}
        {q.isSuccess && candidates.length > 0 && (
          <ul className="br-assign-list">
            {candidates.map((u) => {
              const where = u.branch_name_i18n
                ? locale === "ar"
                  ? u.branch_name_i18n.ar || u.branch_name_i18n.en
                  : u.branch_name_i18n.en
                : null;
              const isPending = pendingId === u.id;
              const errMsg = rowError?.id === u.id ? rowError.msg : null;
              return (
                <li key={u.id} className="br-assign-row">
                  <button
                    type="button"
                    className="br-assign-pick"
                    disabled={isPending || assignMut.isPending}
                    onClick={() => handlePick(u)}
                  >
                    <div className="br-staff-avatar" aria-hidden>
                      {initial(u.name)}
                    </div>
                    <div className="br-assign-meta">
                      <div className="br-staff-name">{u.name}</div>
                      <div className="br-staff-email">{u.email}</div>
                      <div className="br-assign-where">
                        {where ? t("currentlyAt", { branch: where }) : t("unassigned")}
                      </div>
                    </div>
                    <span
                      className={`br-role-pill ${ROLE_CLASS[u.role] ?? ""}`}
                      aria-hidden
                    >
                      {(() => {
                        try {
                          return tRoles(u.role as TenantUserRole);
                        } catch {
                          return u.role;
                        }
                      })()}
                    </span>
                    <span className="br-assign-action">
                      {isPending ? t("assigning") : t("assignCta")}
                    </span>
                  </button>
                  {errMsg && <p className="br-assign-error">{errMsg}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
