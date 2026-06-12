"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, UserMinus, UserPlus, Users } from "lucide-react";
import type { ApiBranchDetail, ApiBranchUser } from "@/lib/api/branches";
import { shiftsListRequest } from "@/lib/api/shifts";
import { userUpdateRequest } from "@/lib/api/users";
import { useAuthStore } from "@/lib/auth/store";
import { AssignUserModal } from "./AssignUserModal";

type RoleKey = "owner" | "manager" | "cashier" | "accountant" | "auditor";

const ROLE_CLASS: Record<string, string> = {
  owner: "br-role-owner",
  manager: "br-role-manager",
  cashier: "br-role-cashier",
  accountant: "br-role-accountant",
  auditor: "br-role-auditor",
};

function initial(name: string): string {
  const first = name.trim().slice(0, 1).toUpperCase();
  return first || "?";
}

export function StaffTab({ branch, locale }: { branch: ApiBranchDetail; locale: "en" | "ar" }) {
  const t = useTranslations("branches.detail.staff");
  const tRoles = useTranslations("settings.users.roles");
  const qc = useQueryClient();
  const currentRole = useAuthStore((s) => s.user?.role ?? "");
  const currentUserId = useAuthStore((s) => s.user?.id ?? "");
  const canEdit = currentRole === "owner";

  const [openAssign, setOpenAssign] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<ApiBranchUser | null>(null);
  const [actionsOpenFor, setActionsOpenFor] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const shiftsQ = useQuery({
    queryKey: ["shifts", branch.id, "open"],
    queryFn: () => shiftsListRequest({ branch_id: branch.id, status: "open", limit: 200 }),
    staleTime: 30_000,
  });

  const onShiftUserIds = useMemo(() => {
    const s = new Set<string>();
    for (const sh of shiftsQ.data?.items ?? []) s.add(sh.cashier_id);
    return s;
  }, [shiftsQ.data]);

  const removeMut = useMutation({
    mutationFn: (userId: string) => userUpdateRequest(userId, { branch_id: null }),
    onSuccess: async () => {
      setRemoveTarget(null);
      setRemoveError(null);
      await qc.invalidateQueries({ queryKey: ["branches", "detail", branch.id] });
      await qc.invalidateQueries({ queryKey: ["users", "list", "assignable"] });
    },
    onError: (err: unknown) => {
      const code =
        err && typeof err === "object" && "code" in err && typeof err.code === "string"
          ? err.code
          : "network";
      setRemoveError(
        code === "cannot_edit_self"
          ? t("errors.cannotEditSelf")
          : code === "last_owner_lock"
            ? t("errors.lastOwnerLock")
            : code === "forbidden_during_impersonation"
              ? t("errors.impersonation")
              : t("errors.network"),
      );
    },
  });

  const branchName = locale === "ar" ? branch.name_i18n.ar || branch.name_i18n.en : branch.name_i18n.en;
  const count = branch.users.length;

  return (
    <section className="br-section">
      <div className="br-staff-head">
        <div>
          <h3 className="br-section-title" style={{ marginBlockEnd: "var(--space-1)" }}>
            {t("title", { branch: branchName })}
          </h3>
          <p className="br-staff-sub">{t("countChip", { count })}</p>
        </div>
        {canEdit && (
          <button
            type="button"
            className="br-btn br-btn-primary"
            onClick={() => setOpenAssign(true)}
          >
            <UserPlus size={14} strokeWidth={1.5} /> {t("assignCta")}
          </button>
        )}
      </div>

      {count === 0 ? (
        <div className="br-staff-empty">
          <Users size={28} strokeWidth={1.5} aria-hidden />
          <h4 className="br-staff-empty-title">{t("emptyTitle")}</h4>
          <p className="br-staff-empty-body">{t("emptyBody")}</p>
          {canEdit && (
            <button
              type="button"
              className="br-btn br-btn-primary"
              onClick={() => setOpenAssign(true)}
            >
              <UserPlus size={14} strokeWidth={1.5} /> {t("assignCta")}
            </button>
          )}
        </div>
      ) : (
        <ul className="br-staff-list">
          {branch.users.map((u) => {
            const onShift = onShiftUserIds.has(u.id);
            const isSelf = u.id === currentUserId;
            return (
              <li key={u.id} className="br-staff-row">
                <div className="br-staff-avatar" aria-hidden>
                  {initial(u.name)}
                </div>
                <div className="br-staff-meta">
                  <div className="br-staff-name">
                    {u.name}
                    {isSelf && <span className="br-you-badge">{t("youBadge")}</span>}
                  </div>
                  <div className="br-staff-email">{u.email}</div>
                </div>
                <div className="br-staff-tags">
                  {onShift && (
                    <span className="br-on-shift" title={t("onShiftHint")}>
                      <span className="br-on-shift-dot" aria-hidden />
                      {t("onShift")}
                    </span>
                  )}
                  <span className={`br-role-pill ${ROLE_CLASS[u.role] ?? ""}`}>
                    {(() => {
                      const key = u.role as RoleKey;
                      try {
                        return tRoles(key);
                      } catch {
                        return u.role;
                      }
                    })()}
                  </span>
                </div>
                {canEdit && (
                  <div className="br-staff-kebab-wrap">
                    <button
                      type="button"
                      className="br-staff-kebab"
                      aria-label={t("rowActionsLabel")}
                      onClick={() =>
                        setActionsOpenFor((cur) => (cur === u.id ? null : u.id))
                      }
                    >
                      <MoreHorizontal size={16} strokeWidth={1.5} />
                    </button>
                    {actionsOpenFor === u.id && (
                      <>
                        <div
                          className="br-staff-menu-scrim"
                          onClick={() => setActionsOpenFor(null)}
                        />
                        <div className="br-staff-menu" role="menu">
                          <button
                            type="button"
                            className="br-staff-menu-item br-staff-menu-danger"
                            role="menuitem"
                            onClick={() => {
                              setActionsOpenFor(null);
                              setRemoveError(null);
                              setRemoveTarget(u);
                            }}
                          >
                            <UserMinus size={14} strokeWidth={1.5} />
                            {t("removeCta")}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {openAssign && (
        <AssignUserModal
          branchId={branch.id}
          branchName={branchName}
          locale={locale}
          onClose={() => setOpenAssign(false)}
        />
      )}

      {removeTarget && (
        <div className="br-modal-scrim" onClick={() => removeMut.isPending || setRemoveTarget(null)}>
          <div
            className="br-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="br-modal-title">{t("removeConfirmTitle")}</h3>
            <p className="br-modal-body">
              {t("removeConfirmBody", { name: removeTarget.name, branch: branchName })}
            </p>
            {removeError && <p className="br-modal-error">{removeError}</p>}
            <div className="br-modal-actions">
              <button
                type="button"
                className="br-btn"
                disabled={removeMut.isPending}
                onClick={() => setRemoveTarget(null)}
              >
                {t("removeConfirmCancel")}
              </button>
              <button
                type="button"
                className="br-btn br-btn-danger"
                disabled={removeMut.isPending}
                onClick={() => removeMut.mutate(removeTarget.id)}
              >
                {removeMut.isPending ? t("removingLabel") : t("removeConfirmCta")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
