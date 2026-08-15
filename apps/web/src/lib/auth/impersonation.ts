/**
 * Impersonation session state, kept in sessionStorage.
 *
 * The access token has to be persisted, not just held in the Zustand store:
 * the handoff finishes with `window.location.replace()`, a full page load that
 * wipes in-memory state. Without this, `AuthBootstrap` fell back to
 * `/v1/auth/refresh`, which mints an ORDINARY tenant token — `mintPair` carries
 * no `impersonator_id`, and `mintImpersonationAccess` mints no refresh half. So
 * a second after "Continue as support" the browser was running on the target
 * user's own session with only a cosmetic banner: actions were attributed to
 * the tenant user rather than double-logged to the impersonator, and
 * `POST /v1/impersonation/exit` failed with `not_impersonating`, leaving the
 * session open forever in the platform audit.
 *
 * sessionStorage (not localStorage) is deliberate: tab-scoped, and gone when
 * the tab closes, which suits a support session capped at one hour.
 */
const SS_KEY = "madar_impersonation";

export interface ImpersonationSession {
  admin_email: string;
  target_tenant_name: string;
  expires_at: string;
  access_token: string;
}

export function readImpersonation(): ImpersonationSession | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(SS_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ImpersonationSession>;
    if (!parsed.access_token || !parsed.admin_email) return null;
    // A session past its stated expiry is dead — the token would 401 anyway.
    if (parsed.expires_at && new Date(parsed.expires_at).getTime() <= Date.now()) {
      sessionStorage.removeItem(SS_KEY);
      return null;
    }
    return parsed as ImpersonationSession;
  } catch {
    sessionStorage.removeItem(SS_KEY);
    return null;
  }
}

export function writeImpersonation(session: ImpersonationSession): void {
  sessionStorage.setItem(SS_KEY, JSON.stringify(session));
}

export function clearImpersonation(): void {
  if (typeof window !== "undefined") sessionStorage.removeItem(SS_KEY);
}
