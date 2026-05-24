import { adminApiFetch } from "./client";

export interface TeamMemberResponse {
  id: string;
  email: string;
  name: string;
  role: string;
  mfa_enabled: boolean;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  has_pending_invite: boolean;
}

export interface InviteMemberInput {
  email: string;
  name: string;
  role: "finance" | "support" | "developer" | "readonly";
}

export interface UpdateRoleInput {
  role: "finance" | "support" | "developer" | "readonly";
}

export interface AcceptInviteInput {
  token: string;
  password: string;
}

export function adminListTeam(): Promise<TeamMemberResponse[]> {
  return adminApiFetch<TeamMemberResponse[]>("/v1/admin/team");
}

export function adminInviteMember(body: InviteMemberInput): Promise<TeamMemberResponse> {
  return adminApiFetch<TeamMemberResponse>("/v1/admin/team/invite", { method: "POST", body });
}

export function adminUpdateMemberRole(id: string, body: UpdateRoleInput): Promise<TeamMemberResponse> {
  return adminApiFetch<TeamMemberResponse>(`/v1/admin/team/${id}/role`, { method: "PATCH", body });
}

export function adminDeactivateMember(id: string): Promise<TeamMemberResponse> {
  return adminApiFetch<TeamMemberResponse>(`/v1/admin/team/${id}/deactivate`, { method: "POST" });
}

export function adminReactivateMember(id: string): Promise<TeamMemberResponse> {
  return adminApiFetch<TeamMemberResponse>(`/v1/admin/team/${id}/reactivate`, { method: "POST" });
}

export function adminAcceptInvite(body: AcceptInviteInput): Promise<{ ok: boolean }> {
  return adminApiFetch<{ ok: boolean }>("/v1/admin/team/accept-invite", {
    method: "POST",
    body,
    noRetryOn401: true,
  });
}
