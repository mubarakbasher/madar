"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/store";
import {
  usersListRequest,
  userResendInviteRequest,
  userResetPasswordRequest,
  userUpdateRequest,
  type ApiTenantUser,
  type TenantUserRole,
} from "@/lib/api/users";
import { InviteUserModal } from "./_components/InviteUserModal";
import { EditUserModal } from "./_components/EditUserModal";
import { ConfirmDialog } from "./_components/ConfirmDialog";
import "./users.css";

type ConfirmKind = "resend" | "resetPassword" | "deactivate" | "reactivate";

interface ConfirmState {
  kind: ConfirmKind;
  user: ApiTenantUser;
  busy: boolean;
  error: string | null;
}

interface ToastState {
  text: string;
  tone: "ok" | "bad";
}

const ROLE_CLASS: Record<TenantUserRole, string> = {
  owner: "usr-role-owner",
  manager: "usr-role-manager",
  cashier: "usr-role-cashier",
  accountant: "usr-role-accountant",
  auditor: "usr-role-auditor",
};

export function UsersClient({ locale }: { locale: "en" | "ar" }) {
  const t = useTranslations("settings.users");
  const qc = useQueryClient();
  const currentRole = useAuthStore((s) => s.user?.role ?? "");
  const currentUserId = useAuthStore((s) => s.user?.id ?? "");
  const patchUser = useAuthStore((s) => s.patchUser);
  const isOwner = currentRole === "owner";

  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [editingUser, setEditingUser] = useState<ApiTenantUser | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmState | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  // Auto-dismiss toasts — same pattern as the verification queue (~3.5s).
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  const listQ = useQuery({
    queryKey: ["users", "list", { search: search.trim(), activeOnly }],
    queryFn: () =>
      usersListRequest({
        search: search.trim() || undefined,
        active_only: activeOnly,
        limit: 100,
      }),
    enabled: isOwner,
    staleTime: 30_000,
  });

  const resendM = useMutation({
    mutationFn: (id: string) => userResendInviteRequest(id),
  });

  const resetPasswordM = useMutation({
    mutationFn: (id: string) => userResetPasswordRequest(id),
  });

  const statusM = useMutation({
    mutationFn: (vars: { id: string; is_active: boolean }) =>
      userUpdateRequest(vars.id, { is_active: vars.is_active }),
  });

  // Owner-only gate — show a static surface rather than redirecting, matching
  // the existing Settings shell behavior (it never bounces users away from a
  // settings page).
  if (!isOwner) {
    return (
      <div className="usr">
        <header className="usr-header">
          <div className="usr-kicker">{t("kicker")}</div>
          <h1 className="usr-title">{t("title")}</h1>
        </header>
        <div className="usr-denied" role="alert">
          <h1>{t("ownerOnly.title")}</h1>
          <p>{t("ownerOnly.body")}</p>
          <a className="usr-btn" href={`/${locale}/settings/security`}>
            {t("ownerOnly.back")}
          </a>
        </div>
      </div>
    );
  }

  async function handleConfirmResend(): Promise<void> {
    if (!confirmAction) return;
    setConfirmAction({ ...confirmAction, busy: true, error: null });
    try {
      await resendM.mutateAsync(confirmAction.user.id);
      await qc.invalidateQueries({ queryKey: ["users", "list"] });
      setToast({ text: t("resendConfirm.sentToast"), tone: "ok" });
      setConfirmAction(null);
    } catch (err) {
      setConfirmAction({
        ...confirmAction,
        busy: false,
        error: errorToMessage(err, t),
      });
    }
  }

  async function handleConfirmResetPassword(): Promise<void> {
    if (!confirmAction) return;
    setConfirmAction({ ...confirmAction, busy: true, error: null });
    try {
      await resetPasswordM.mutateAsync(confirmAction.user.id);
      setToast({
        text: t("resetPasswordConfirm.sentToast", { email: confirmAction.user.email }),
        tone: "ok",
      });
      setConfirmAction(null);
    } catch (err) {
      setConfirmAction({
        ...confirmAction,
        busy: false,
        error: errorToMessage(err, t),
      });
    }
  }

  async function handleConfirmStatusToggle(): Promise<void> {
    if (!confirmAction) return;
    const nextActive = confirmAction.kind === "reactivate";
    setConfirmAction({ ...confirmAction, busy: true, error: null });
    try {
      await statusM.mutateAsync({ id: confirmAction.user.id, is_active: nextActive });
      await qc.invalidateQueries({ queryKey: ["users", "list"] });
      setConfirmAction(null);
    } catch (err) {
      setConfirmAction({
        ...confirmAction,
        busy: false,
        error: errorToMessage(err, t),
      });
    }
  }

  function renderConfirm() {
    if (!confirmAction) return null;
    const { kind, user, busy, error } = confirmAction;
    if (kind === "resend") {
      return (
        <ConfirmDialog
          title={t("resendConfirm.title")}
          body={t("resendConfirm.body")}
          confirmLabel={t("resendConfirm.confirm")}
          cancelLabel={t("resendConfirm.cancel")}
          tone="primary"
          busy={busy}
          error={error}
          onConfirm={() => void handleConfirmResend()}
          onCancel={() => setConfirmAction(null)}
        />
      );
    }
    if (kind === "resetPassword") {
      return (
        <ConfirmDialog
          title={t("resetPasswordConfirm.title")}
          body={t("resetPasswordConfirm.body", { name: user.name, email: user.email })}
          confirmLabel={t("resetPasswordConfirm.confirm")}
          cancelLabel={t("resetPasswordConfirm.cancel")}
          tone="primary"
          busy={busy}
          error={error}
          onConfirm={() => void handleConfirmResetPassword()}
          onCancel={() => setConfirmAction(null)}
        />
      );
    }
    if (kind === "deactivate") {
      return (
        <ConfirmDialog
          title={t("deactivateConfirm.title")}
          body={t("deactivateConfirm.body", { name: user.name })}
          confirmLabel={t("deactivateConfirm.confirm")}
          cancelLabel={t("deactivateConfirm.cancel")}
          tone="danger"
          busy={busy}
          error={error}
          onConfirm={() => void handleConfirmStatusToggle()}
          onCancel={() => setConfirmAction(null)}
        />
      );
    }
    return (
      <ConfirmDialog
        title={t("reactivateConfirm.title")}
        body={t("reactivateConfirm.body", { name: user.name })}
        confirmLabel={t("reactivateConfirm.confirm")}
        cancelLabel={t("reactivateConfirm.cancel")}
        tone="primary"
        busy={busy}
        error={error}
        onConfirm={() => void handleConfirmStatusToggle()}
        onCancel={() => setConfirmAction(null)}
      />
    );
  }

  if (listQ.isPending) {
    return (
      <div className="usr">
        <Header t={t} />
        <div className="usr-skeleton">{t("loading")}</div>
      </div>
    );
  }

  if (listQ.isError) {
    return (
      <div className="usr">
        <Header t={t} />
        <div className="usr-error">
          <h2>{t("error.title")}</h2>
          <p>{t("error.body")}</p>
          <button type="button" className="usr-btn" onClick={() => void listQ.refetch()}>
            {t("error.retry")}
          </button>
        </div>
      </div>
    );
  }

  const items = listQ.data?.items ?? [];

  return (
    <div className="usr">
      <Header t={t} />

      <div className="usr-toolbar">
        <input
          type="text"
          className="usr-search"
          placeholder={t("filters.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="usr-toggle">
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(e) => setActiveOnly(e.target.checked)}
          />
          {t("filters.activeOnly")}
        </label>
        <div className="usr-toolbar-spacer" />
        <button
          type="button"
          className="usr-btn usr-btn-primary"
          onClick={() => setInviting(true)}
        >
          <Plus size={14} strokeWidth={1.5} />
          {t("inviteUser")}
        </button>
      </div>

      {items.length === 0 ? (
        <div className="usr-empty">
          <h2 className="usr-empty-title">{t("empty.title")}</h2>
          <p className="usr-empty-body">{t("empty.body")}</p>
          <button
            type="button"
            className="usr-btn usr-btn-primary"
            onClick={() => setInviting(true)}
          >
            <Plus size={14} strokeWidth={1.5} />
            {t("inviteUser")}
          </button>
        </div>
      ) : (
        <div className="usr-table-wrap">
          <table className="usr-table">
            <thead>
              <tr>
                <th>{t("columns.name")}</th>
                <th>{t("columns.email")}</th>
                <th>{t("columns.role")}</th>
                <th>{t("columns.branch")}</th>
                <th>{t("columns.status")}</th>
                <th>{t("columns.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  locale={locale}
                  isSelf={u.id === currentUserId}
                  onEdit={() => setEditingUser(u)}
                  onResend={() =>
                    setConfirmAction({
                      kind: "resend",
                      user: u,
                      busy: false,
                      error: null,
                    })
                  }
                  onResetPassword={() =>
                    setConfirmAction({
                      kind: "resetPassword",
                      user: u,
                      busy: false,
                      error: null,
                    })
                  }
                  onToggleActive={() =>
                    setConfirmAction({
                      kind: u.is_active ? "deactivate" : "reactivate",
                      user: u,
                      busy: false,
                      error: null,
                    })
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {inviting && (
        <InviteUserModal
          locale={locale}
          onClose={(created) => {
            setInviting(false);
            if (created) {
              setToast({
                text: t("inviteModal.sentToast", { email: created.email }),
                tone: "ok",
              });
            }
          }}
        />
      )}

      {editingUser && (
        <EditUserModal
          user={editingUser}
          locale={locale}
          isSelf={editingUser.id === currentUserId}
          onClose={(updated) => {
            if (updated && updated.id === currentUserId) {
              // Reflect the new branch in the live session so the POS unlocks
              // without a re-login.
              patchUser({ branch_id: updated.branch_id });
              setToast({ text: t("editModal.selfUpdatedToast"), tone: "ok" });
            }
            setEditingUser(null);
          }}
        />
      )}

      {renderConfirm()}

      {toast && (
        <div role="status" className={`usr-toast usr-toast--${toast.tone}`}>
          {toast.text}
        </div>
      )}
    </div>
  );
}

function Header({ t }: { t: (k: string) => string }) {
  return (
    <header className="usr-header">
      <div className="usr-kicker">{t("kicker")}</div>
      <h1 className="usr-title">{t("title")}</h1>
      <p className="usr-subtitle">{t("subtitle")}</p>
    </header>
  );
}

function UserRow({
  user,
  locale,
  isSelf,
  onEdit,
  onResend,
  onResetPassword,
  onToggleActive,
}: {
  user: ApiTenantUser;
  locale: "en" | "ar";
  isSelf: boolean;
  onEdit: () => void;
  onResend: () => void;
  onResetPassword: () => void;
  onToggleActive: () => void;
}) {
  const t = useTranslations("settings.users");
  const branchLabel =
    user.branch_name_i18n?.[locale] || user.branch_code || null;

  // "Pending invite" supersedes active/inactive when the user hasn't yet
  // claimed their account — they aren't really usable until they complete
  // reset-password. Once verified, fall back to the active/inactive split.
  const showPending = user.has_pending_invite;
  const canResend = user.has_pending_invite || !user.email_verified;

  return (
    <tr>
      <td>
        <span className="usr-cell-name">{user.name}</span>
      </td>
      <td>
        <span className="usr-cell-email">{user.email}</span>
      </td>
      <td>
        <span className={`usr-role-pill ${ROLE_CLASS[user.role]}`}>
          {t(`roles.${user.role}`)}
        </span>
      </td>
      <td>
        {branchLabel ? (
          <span className="usr-cell-branch">{branchLabel}</span>
        ) : (
          <span className="usr-cell-branch-empty">{t("branch.unassigned")}</span>
        )}
      </td>
      <td>
        {showPending ? (
          <span className="usr-pill usr-status-pending">{t("status.pending")}</span>
        ) : user.is_active ? (
          <span className="usr-pill usr-status-active">{t("status.active")}</span>
        ) : (
          <span className="usr-pill usr-status-inactive">{t("status.inactive")}</span>
        )}
      </td>
      <td>
        {isSelf ? (
          <div className="usr-row-actions">
            <span className="usr-you-badge">{t("youBadge")}</span>
            <button
              type="button"
              className="usr-btn usr-btn-ghost usr-btn-sm"
              onClick={onEdit}
            >
              {t("actions.editBranch")}
            </button>
          </div>
        ) : (
          <div className="usr-row-actions">
            <button
              type="button"
              className="usr-btn usr-btn-ghost usr-btn-sm"
              onClick={onEdit}
            >
              {t("actions.edit")}
            </button>
            {canResend && (
              <button
                type="button"
                className="usr-btn usr-btn-ghost usr-btn-sm"
                onClick={onResend}
              >
                {t("actions.resendInvite")}
              </button>
            )}
            {!canResend && user.is_active && (
              <button
                type="button"
                className="usr-btn usr-btn-ghost usr-btn-sm"
                onClick={onResetPassword}
              >
                {t("actions.resetPassword")}
              </button>
            )}
            <button
              type="button"
              className={`usr-btn usr-btn-ghost usr-btn-sm${user.is_active ? " usr-btn-danger" : ""}`}
              onClick={onToggleActive}
            >
              {user.is_active ? t("actions.deactivate") : t("actions.reactivate")}
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

function errorToMessage(err: unknown, t: (k: string) => string): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case "cannot_resend_self":
        return t("errors.cannot_resend_self");
      case "cannot_edit_self":
        return t("errors.cannot_edit_self");
      case "last_owner_lock":
        return t("errors.last_owner_lock");
      case "unknown_user":
        return t("errors.unknown_user");
      case "forbidden_role":
        return t("errors.forbidden_role");
      case "validation_failed":
        return t("errors.validation_failed");
      default:
        return err.message || t("errors.generic");
    }
  }
  return t("errors.generic");
}
