import { Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import jwt, { type SignOptions } from "jsonwebtoken";
import { loadEnv } from "../../env";
import { RedisService } from "../../common/redis.service";

export interface AccessClaims {
  sub: string;
  tenant_id: string;
  user_id: string;
  role: string;
  realm: "tenant";
  typ: "access";
  jti: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
  impersonator_id?: string;
  impersonator_email?: string;
}

export interface ImpersonationToken {
  access_token: string;
  expires_in: number;
  jti: string;
  expires_at: string;
}

export interface MfaPendingClaims {
  sub: string;
  tenant_id: string;
  user_id: string;
  realm: "tenant";
  typ: "mfa_pending";
  jti: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

const IMPERSONATION_TTL_SECONDS = 3600; // 1h hard cap per CLAUDE.md.

export interface RefreshClaims extends Omit<AccessClaims, "typ"> {
  typ: "refresh";
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  access_expires_in: number;
  refresh_expires_in: number;
  access_jti: string;
  refresh_jti: string;
}

const ISS = "madar";
const TENANT_AUD = "madar.tenant";

@Injectable()
export class TokenService {
  constructor(private readonly redis: RedisService) {}

  async mintPair(p: {
    userId: string;
    tenantId: string;
    role: string;
  }): Promise<TokenPair> {
    const env = loadEnv();
    const accessTtl = parseDuration(env.JWT_TENANT_ACCESS_TTL);
    const refreshTtl = parseDuration(env.JWT_TENANT_REFRESH_TTL);
    const accessJti = randomUUID();
    const refreshJti = randomUUID();

    const accessOpts: SignOptions = {
      algorithm: "HS256",
      issuer: ISS,
      audience: TENANT_AUD,
      expiresIn: accessTtl,
      jwtid: accessJti,
    };
    const refreshOpts: SignOptions = { ...accessOpts, expiresIn: refreshTtl, jwtid: refreshJti };

    const accessPayload = {
      sub: p.userId,
      tenant_id: p.tenantId,
      user_id: p.userId,
      role: p.role,
      realm: "tenant" as const,
      typ: "access" as const,
    };
    const refreshPayload = { ...accessPayload, typ: "refresh" as const };

    const accessToken = jwt.sign(accessPayload, env.JWT_TENANT_SECRET, accessOpts);
    const refreshToken = jwt.sign(refreshPayload, env.JWT_TENANT_SECRET, refreshOpts);

    // Register the refresh jti so refresh-reuse detection works.
    await this.redis.setEx(
      this.refreshKey(p.userId, refreshJti),
      JSON.stringify({ tenantId: p.tenantId, role: p.role, mintedAt: Date.now() }),
      refreshTtl,
    );

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      access_expires_in: accessTtl,
      refresh_expires_in: refreshTtl,
      access_jti: accessJti,
      refresh_jti: refreshJti,
    };
  }

  verifyAccess(token: string): AccessClaims {
    const env = loadEnv();
    try {
      const payload = jwt.verify(token, env.JWT_TENANT_SECRET, {
        algorithms: ["HS256"],
        issuer: ISS,
        audience: TENANT_AUD,
      }) as AccessClaims;
      if (payload.realm !== "tenant") throw new Error("realm mismatch");
      if (payload.typ !== "access") throw new Error("token type mismatch");
      return payload;
    } catch {
      throw new UnauthorizedException({
        code: "access_expired",
        message: "Access token invalid or expired",
      });
    }
  }

  verifyRefresh(token: string): RefreshClaims {
    const env = loadEnv();
    try {
      const payload = jwt.verify(token, env.JWT_TENANT_SECRET, {
        algorithms: ["HS256"],
        issuer: ISS,
        audience: TENANT_AUD,
      }) as RefreshClaims;
      if (payload.realm !== "tenant") throw new Error("realm mismatch");
      if (payload.typ !== "refresh") throw new Error("token type mismatch");
      return payload;
    } catch {
      throw new UnauthorizedException({
        code: "refresh_invalid",
        message: "Refresh token invalid or expired",
      });
    }
  }

  /**
   * Mint a short-lived tenant access token on behalf of a target user, carrying
   * an `impersonator_id` claim. Validates against TenantAuthGuard like any
   * normal tenant access token; no refresh half is minted.
   */
  async mintImpersonationAccess(p: {
    tenantId: string;
    targetUserId: string;
    targetRole: string;
    impersonatorId: string;
    impersonatorEmail: string;
  }): Promise<ImpersonationToken> {
    const env = loadEnv();
    const jti = randomUUID();
    const opts: SignOptions = {
      algorithm: "HS256",
      issuer: ISS,
      audience: TENANT_AUD,
      expiresIn: IMPERSONATION_TTL_SECONDS,
      jwtid: jti,
    };
    const payload = {
      sub: p.targetUserId,
      tenant_id: p.tenantId,
      user_id: p.targetUserId,
      role: p.targetRole,
      realm: "tenant" as const,
      typ: "access" as const,
      impersonator_id: p.impersonatorId,
      impersonator_email: p.impersonatorEmail,
    };
    const token = jwt.sign(payload, env.JWT_TENANT_SECRET, opts);
    // Register the impersonation jti so it can be revoked on exit.
    await this.redis.setEx(this.imperKey(jti), "alive", IMPERSONATION_TTL_SECONDS);
    return {
      access_token: token,
      expires_in: IMPERSONATION_TTL_SECONDS,
      jti,
      expires_at: new Date(Date.now() + IMPERSONATION_TTL_SECONDS * 1000).toISOString(),
    };
  }

  async isImpersonationAlive(jti: string): Promise<boolean> {
    const v = await this.redis.get(this.imperKey(jti));
    return v !== null;
  }

  async revokeImpersonation(jti: string): Promise<void> {
    await this.redis.del(this.imperKey(jti));
  }

  private imperKey(jti: string): string {
    return `imper:${jti}`;
  }

  // ─── mfa_pending (5min, no refresh half) ───────────────────────────
  async mintMfaPending(p: { userId: string; tenantId: string }): Promise<{
    token: string;
    expires_in: number;
    jti: string;
  }> {
    const env = loadEnv();
    const ttl = parseDuration(env.JWT_TENANT_MFA_PENDING_TTL);
    const jti = randomUUID();
    const opts: SignOptions = {
      algorithm: "HS256",
      issuer: ISS,
      audience: TENANT_AUD,
      expiresIn: ttl,
      jwtid: jti,
    };
    const token = jwt.sign(
      {
        sub: p.userId,
        tenant_id: p.tenantId,
        user_id: p.userId,
        realm: "tenant" as const,
        typ: "mfa_pending" as const,
      },
      env.JWT_TENANT_SECRET,
      opts,
    );
    // Track the jti so each mfa_pending token is single-use.
    await this.redis.setEx(this.mfaPendingKey(jti), "alive", ttl);
    return { token, expires_in: ttl, jti };
  }

  verifyMfaPending(token: string): MfaPendingClaims {
    const env = loadEnv();
    try {
      const payload = jwt.verify(token, env.JWT_TENANT_SECRET, {
        algorithms: ["HS256"],
        issuer: ISS,
        audience: TENANT_AUD,
      }) as MfaPendingClaims;
      if (payload.realm !== "tenant") throw new Error("realm mismatch");
      if (payload.typ !== "mfa_pending") throw new Error("token type mismatch");
      return payload;
    } catch {
      throw new UnauthorizedException({
        code: "mfa_pending_invalid",
        message: "MFA challenge token invalid or expired",
      });
    }
  }

  async isMfaPendingAlive(jti: string): Promise<boolean> {
    const v = await this.redis.get(this.mfaPendingKey(jti));
    return v !== null;
  }

  async consumeMfaPending(jti: string): Promise<void> {
    await this.redis.del(this.mfaPendingKey(jti));
  }

  private mfaPendingKey(jti: string): string {
    return `mfa-pending:tenant:${jti}`;
  }

  /**
   * Revoke EVERY refresh jti for a user. Called by reset-password so that any
   * stolen refresh cookies are nuked at the same time the password rotates.
   */
  async revokeAllRefreshTokensForUser(userId: string): Promise<number> {
    return this.redis.delByPattern(this.refreshKey(userId, "*"));
  }

  async isRefreshAlive(userId: string, jti: string): Promise<boolean> {
    const v = await this.redis.get(this.refreshKey(userId, jti));
    return v !== null;
  }

  async revokeRefresh(userId: string, jti: string): Promise<void> {
    await this.redis.del(this.refreshKey(userId, jti));
  }

  /**
   * Revoke every refresh token for a user — invoked when a stolen jti is replayed.
   */
  async revokeRefreshFamily(userId: string): Promise<void> {
    await this.redis.delByPattern(this.refreshKey(userId, "*"));
  }

  private refreshKey(userId: string, jti: string): string {
    return `refresh:${userId}:${jti}`;
  }

  /**
   * Stable hash for logging — never log raw tokens.
   */
  fingerprint(token: string): string {
    return createHash("sha256").update(token).digest("hex").slice(0, 16);
  }
}

function parseDuration(s: string): number {
  const m = s.match(/^(\d+)\s*([smhd])$/);
  if (!m) throw new Error(`Invalid duration: ${s}`);
  const n = Number(m[1]);
  const unit = m[2];
  switch (unit) {
    case "s":
      return n;
    case "m":
      return n * 60;
    case "h":
      return n * 3600;
    case "d":
      return n * 86400;
    default:
      throw new Error(`Invalid unit: ${unit}`);
  }
}
