"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Mail,
  MoreVertical,
  Plus,
  Shield,
  ShieldCheck,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import {
  adminDeactivateMember,
  adminInviteMember,
  adminListTeam,
  adminReactivateMember,
  adminUpdateMemberRole,
  type InviteMemberInput,
  type TeamMemberResponse,
} from "@/lib/api/admin-team";
import { useAdminAuthStore } from "@/lib/auth/store";

type Tab = "members" | "roles";
type ModalState = { type: "none" } | { type: "invite" } | { type: "role"; member: TeamMemberResponse };

const ROLE_LABELS: Record<string, string> = {
  owner: "Platform Owner",
  finance: "Finance / Verifier",
  support: "Support",
  developer: "Developer",
  readonly: "Read-only",
};

const ROLE_COLORS: Record<string, string> = {
  owner: "admin-chip-owner",
  finance: "admin-chip-finance",
  support: "admin-chip-support",
  developer: "admin-chip-developer",
  readonly: "admin-chip-readonly",
};

function roleChipClass(role: string): string {
  return ROLE_COLORS[role] ?? "admin-chip-inactive";
}

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function memberStatus(m: TeamMemberResponse): { label: string; cls: string } {
  if (m.has_pending_invite) return { label: "Pending", cls: "admin-chip-pending" };
  if (!m.is_active) return { label: "Deactivated", cls: "admin-chip-inactive" };
  return { label: "Active", cls: "admin-chip-active" };
}

export function TeamClient() {
  const [tab, setTab] = useState<Tab>("members");

  return (
    <>
      <header className="admin-page-header">
        <div>
          <span className="admin-kpi-kicker">Settings</span>
          <h1 className="admin-page-title" style={{ marginTop: 6 }}>
            Team
          </h1>
          <p className="admin-page-sub">
            Manage super-admin team members, roles, and invitations.
          </p>
        </div>
      </header>

      <div className="admin-tabs">
        <button
          type="button"
          className={`admin-tab ${tab === "members" ? "admin-tab-active" : ""}`}
          onClick={() => setTab("members")}
        >
          <Users size={14} strokeWidth={1.5} />
          Members
        </button>
        <button
          type="button"
          className={`admin-tab ${tab === "roles" ? "admin-tab-active" : ""}`}
          onClick={() => setTab("roles")}
        >
          <Shield size={14} strokeWidth={1.5} />
          Roles
        </button>
      </div>

      {tab === "members" && <MembersTab />}
      {tab === "roles" && <RolesTab />}
    </>
  );
}

function MembersTab() {
  const user = useAdminAuthStore((s) => s.user);
  const isOwner = user?.role === "owner";
  const qc = useQueryClient();
  const [modal, setModal] = useState<ModalState>({ type: "none" });
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  const query = useQuery<TeamMemberResponse[]>({
    queryKey: ["admin", "team"],
    queryFn: adminListTeam,
    staleTime: 30_000,
  });

  const deactivate = useMutation({
    mutationFn: adminDeactivateMember,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin", "team"] }),
  });

  const reactivate = useMutation({
    mutationFn: adminReactivateMember,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin", "team"] }),
  });

  return (
    <>
      {isOwner && (
        <div className="admin-filter-row" style={{ justifyContent: "flex-end" }}>
          <button
            type="button"
            className="admin-btn admin-btn-primary"
            onClick={() => setModal({ type: "invite" })}
          >
            <Plus size={16} strokeWidth={1.75} />
            <span>Invite member</span>
          </button>
        </div>
      )}

      {query.isPending ? (
        <div className="admin-skeleton-block" aria-busy="true">
          Loading team members...
        </div>
      ) : query.isError ? (
        <div className="admin-error-block">
          Could not load team.{" "}
          <button type="button" className="admin-link" onClick={() => void query.refetch()}>
            Retry
          </button>
        </div>
      ) : query.data.length === 0 ? (
        <EmptyTeam onInvite={() => setModal({ type: "invite" })} isOwner={isOwner} />
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ width: 44 }} aria-label="Avatar" />
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>MFA</th>
              <th>Last login</th>
              <th>Status</th>
              {isOwner && <th style={{ width: 48 }} aria-label="Actions" />}
            </tr>
          </thead>
          <tbody>
            {query.data.map((m) => {
              const status = memberStatus(m);
              return (
                <tr key={m.id} style={{ opacity: m.is_active || m.has_pending_invite ? 1 : 0.55 }}>
                  <td>
                    <span className="admin-tenant-avatar" aria-hidden="true">
                      {m.name.charAt(0).toUpperCase()}
                    </span>
                  </td>
                  <td style={{ fontWeight: 500 }}>{m.name}</td>
                  <td className="admin-muted">{m.email}</td>
                  <td>
                    <span className={roleChipClass(m.role)}>
                      {ROLE_LABELS[m.role] ?? m.role}
                    </span>
                  </td>
                  <td>
                    <span
                      className={m.mfa_enabled ? "admin-dot-green" : "admin-dot-red"}
                      title={m.mfa_enabled ? "MFA enabled" : "MFA not enabled"}
                    />
                  </td>
                  <td className="admin-muted">{relativeTime(m.last_login_at)}</td>
                  <td>
                    <span className={status.cls}>{status.label}</span>
                  </td>
                  {isOwner && (
                    <td style={{ position: "relative" }}>
                      {m.role !== "owner" && (
                        <>
                          <button
                            type="button"
                            className="admin-icon-btn"
                            aria-label="Actions"
                            onClick={() => setMenuOpen(menuOpen === m.id ? null : m.id)}
                          >
                            <MoreVertical size={16} strokeWidth={1.5} />
                          </button>
                          {menuOpen === m.id && (
                            <div className="admin-dropdown">
                              <button
                                type="button"
                                className="admin-dropdown-item"
                                onClick={() => {
                                  setMenuOpen(null);
                                  setModal({ type: "role", member: m });
                                }}
                              >
                                <Shield size={14} strokeWidth={1.5} />
                                Change role
                              </button>
                              {m.is_active ? (
                                <button
                                  type="button"
                                  className="admin-dropdown-item admin-dropdown-danger"
                                  onClick={() => {
                                    setMenuOpen(null);
                                    if (confirm(`Deactivate ${m.name}? They will lose access.`)) {
                                      deactivate.mutate(m.id);
                                    }
                                  }}
                                >
                                  <UserMinus size={14} strokeWidth={1.5} />
                                  Deactivate
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="admin-dropdown-item"
                                  onClick={() => {
                                    setMenuOpen(null);
                                    reactivate.mutate(m.id);
                                  }}
                                >
                                  <UserCheck size={14} strokeWidth={1.5} />
                                  Reactivate
                                </button>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {modal.type === "invite" && (
        <InviteMemberModal onClose={() => setModal({ type: "none" })} />
      )}
      {modal.type === "role" && (
        <ChangeRoleModal member={modal.member} onClose={() => setModal({ type: "none" })} />
      )}
    </>
  );
}

function EmptyTeam({ onInvite, isOwner }: { onInvite: () => void; isOwner: boolean }) {
  return (
    <div className="admin-empty-block">
      <Users size={32} strokeWidth={1.25} />
      <h2>No team members yet</h2>
      <p>Invite people to help manage the platform — finance, support, or developer roles.</p>
      {isOwner ? (
        <button type="button" className="admin-btn admin-btn-primary" onClick={onInvite}>
          <UserPlus size={16} strokeWidth={1.75} />
          Invite first member
        </button>
      ) : (
        <p className="admin-muted">Only the Platform Owner can invite team members.</p>
      )}
    </div>
  );
}

function InviteMemberModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<InviteMemberInput["role"]>("readonly");
  const [error, setError] = useState<string | null>(null);

  const invite = useMutation({
    mutationFn: adminInviteMember,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "team"] });
      onClose();
    },
    onError: (err: Error & { code?: string; message?: string }) => {
      setError(err.message || "Failed to send invite.");
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    invite.mutate({ email: email.trim(), name: name.trim(), role });
  }

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        <header className="admin-modal-header">
          <Mail size={20} strokeWidth={1.5} />
          <h2>Invite team member</h2>
        </header>

        <form onSubmit={handleSubmit} className="admin-modal-body">
          <div className="admin-field">
            <label htmlFor="invite-email">Email</label>
            <input
              id="invite-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@company.com"
              className="admin-input"
              autoFocus
            />
          </div>

          <div className="admin-field">
            <label htmlFor="invite-name">Name</label>
            <input
              id="invite-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              className="admin-input"
            />
          </div>

          <div className="admin-field">
            <label htmlFor="invite-role">Role</label>
            <select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value as InviteMemberInput["role"])}
              className="admin-input"
            >
              <option value="finance">Finance / Verifier</option>
              <option value="support">Support</option>
              <option value="developer">Developer</option>
              <option value="readonly">Read-only</option>
            </select>
          </div>

          {error && (
            <div className="admin-error-inline">{error}</div>
          )}

          <div className="admin-modal-actions">
            <button type="button" className="admin-btn admin-btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="admin-btn admin-btn-primary"
              disabled={invite.isPending}
            >
              {invite.isPending ? "Sending..." : "Send invite"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ChangeRoleModal({
  member,
  onClose,
}: {
  member: TeamMemberResponse;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [role, setRole] = useState(member.role as "finance" | "support" | "developer" | "readonly");
  const [error, setError] = useState<string | null>(null);

  const update = useMutation({
    mutationFn: (newRole: "finance" | "support" | "developer" | "readonly") =>
      adminUpdateMemberRole(member.id, { role: newRole }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "team"] });
      onClose();
    },
    onError: (err: Error & { message?: string }) => {
      setError(err.message || "Failed to update role.");
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    update.mutate(role);
  }

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        <header className="admin-modal-header">
          <Shield size={20} strokeWidth={1.5} />
          <h2>Change role for {member.name}</h2>
        </header>

        <form onSubmit={handleSubmit} className="admin-modal-body">
          <div className="admin-field">
            <label htmlFor="change-role">New role</label>
            <select
              id="change-role"
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
              className="admin-input"
            >
              <option value="finance">Finance / Verifier</option>
              <option value="support">Support</option>
              <option value="developer">Developer</option>
              <option value="readonly">Read-only</option>
            </select>
          </div>

          {error && <div className="admin-error-inline">{error}</div>}

          <div className="admin-modal-actions">
            <button type="button" className="admin-btn admin-btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="admin-btn admin-btn-primary"
              disabled={update.isPending || role === member.role}
            >
              {update.isPending ? "Updating..." : "Update role"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Roles tab ─────────────────────────────────────────────────────────

const ROLE_DEFINITIONS = [
  {
    role: "owner",
    label: "Platform Owner",
    description: "Full access -- manage team, billing, tenants, impersonation",
    permissions: ["Manage team members", "Manage plans and billing", "View and edit all tenants", "Impersonate tenant users", "Access all platform settings"],
  },
  {
    role: "finance",
    label: "Finance / Verifier",
    description: "Verify payments, view invoices, view tenants, view reports",
    permissions: ["Verify payment proofs", "View invoices and billing", "View tenant list (read-only)", "View financial reports"],
  },
  {
    role: "support",
    label: "Support",
    description: "View tenants, impersonate for support, view audit logs",
    permissions: ["View tenants and their details", "Impersonate for support (logged)", "View audit logs", "Cannot modify billing or plans"],
  },
  {
    role: "developer",
    label: "Developer",
    description: "View system health, logs, feature flags",
    permissions: ["View system health dashboard", "View application logs", "Manage feature flags", "Cannot access billing or tenant data"],
  },
  {
    role: "readonly",
    label: "Read-only",
    description: "View dashboard and reports only",
    permissions: ["View main dashboard KPIs", "View aggregate reports", "No write access to any resource"],
  },
] as const;

function RolesTab() {
  const query = useQuery<TeamMemberResponse[]>({
    queryKey: ["admin", "team"],
    queryFn: adminListTeam,
    staleTime: 30_000,
  });

  const memberCounts = (query.data ?? []).reduce<Record<string, number>>((acc, m) => {
    acc[m.role] = (acc[m.role] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="admin-roles-grid">
      {ROLE_DEFINITIONS.map((r) => (
        <div key={r.role} className="admin-role-card">
          <div className="admin-role-card-header">
            <ShieldCheck size={18} strokeWidth={1.5} />
            <h3>{r.label}</h3>
            <span className="admin-muted" style={{ marginInlineStart: "auto", fontSize: 12 }}>
              {memberCounts[r.role] ?? 0} member{(memberCounts[r.role] ?? 0) !== 1 ? "s" : ""}
            </span>
          </div>
          <p className="admin-role-card-desc">{r.description}</p>
          <ul className="admin-role-card-perms">
            {r.permissions.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
