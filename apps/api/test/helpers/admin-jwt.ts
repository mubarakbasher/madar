import { randomUUID } from "node:crypto";
import jwt, { type SignOptions } from "jsonwebtoken";

const ISS = "madar";
const TENANT_AUD = "madar.tenant";

/**
 * Mint an "admin"-realm JWT signed with the *tenant* secret. The realm-canary
 * test uses this to prove TenantAuthGuard rejects admin-realm tokens even
 * when they're cryptographically valid against the tenant secret.
 */
export function mintAdminRealmToken(): string {
  const secret = process.env.JWT_TENANT_SECRET;
  if (!secret) throw new Error("JWT_TENANT_SECRET not set in test env");
  const opts: SignOptions = {
    algorithm: "HS256",
    issuer: ISS,
    audience: TENANT_AUD,
    expiresIn: "15m",
    jwtid: randomUUID(),
  };
  return jwt.sign(
    {
      sub: randomUUID(),
      tenant_id: randomUUID(),
      user_id: randomUUID(),
      role: "owner",
      realm: "admin",
      typ: "access",
    },
    secret,
    opts,
  );
}

/**
 * Mint a tenant-realm token but with typ:"refresh" — i.e. a refresh token used
 * as a bearer. Guards must reject this because the typ guard is the second
 * fence after the realm guard.
 */
export function mintRefreshAsAccess(): string {
  const secret = process.env.JWT_TENANT_SECRET;
  if (!secret) throw new Error("JWT_TENANT_SECRET not set in test env");
  const opts: SignOptions = {
    algorithm: "HS256",
    issuer: ISS,
    audience: TENANT_AUD,
    expiresIn: "30d",
    jwtid: randomUUID(),
  };
  return jwt.sign(
    {
      sub: randomUUID(),
      tenant_id: randomUUID(),
      user_id: randomUUID(),
      role: "owner",
      realm: "tenant",
      typ: "refresh",
    },
    secret,
    opts,
  );
}
