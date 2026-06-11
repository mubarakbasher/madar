import { Injectable, UnauthorizedException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import jwt, { type SignOptions } from "jsonwebtoken";
import { loadEnv } from "../../env";
import { RedisService } from "../../common/redis.service";

const ISS = "madar";
const ADMIN_AUD = "madar.admin";

export interface AdminAccessClaims {
  sub: string;
  platform_user_id: string;
  email: string;
  role: string;
  mfa_verified_at: number;
  realm: "admin";
  typ: "access";
  jti: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

export interface AdminRefreshClaims extends Omit<AdminAccessClaims, "typ"> {
  typ: "refresh";
}

export interface AdminMfaPendingClaims {
  sub: string;
  platform_user_id: string;
  email: string;
  realm: "admin";
  typ: "mfa_pending";
  jti: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

export interface AdminTokenPair {
  access_token: string;
  refresh_token: string;
  access_expires_in: number;
  refresh_expires_in: number;
  access_jti: string;
  refresh_jti: string;
}

@Injectable()
export class AdminTokenService {
  constructor(private readonly redis: RedisService) {}

  // ─── mfa_pending (5min, no refresh half) ───────────────────────────
  // Each challenge jti is registered in Redis and consumed on success (or
  // voided after too many wrong codes) — a captured mfa_pending token must
  // not be replayable for its whole TTL. Mirrors the tenant flow.
  private mfaPendingKey(jti: string): string {
    return `mfa-pending:admin:${jti}`;
  }

  async mintMfaPending(p: { platformUserId: string; email: string }): Promise<{
    token: string;
    expires_in: number;
    jti: string;
  }> {
    const env = loadEnv();
    const ttl = parseDuration(env.JWT_ADMIN_MFA_PENDING_TTL);
    const jti = randomUUID();
    const opts: SignOptions = {
      algorithm: "HS256",
      issuer: ISS,
      audience: ADMIN_AUD,
      expiresIn: ttl,
      jwtid: jti,
    };
    const token = jwt.sign(
      {
        sub: p.platformUserId,
        platform_user_id: p.platformUserId,
        email: p.email,
        realm: "admin" as const,
        typ: "mfa_pending" as const,
      },
      env.JWT_ADMIN_SECRET,
      opts,
    );
    // Value = failed TOTP attempts so far.
    await this.redis.setEx(this.mfaPendingKey(jti), "0", ttl);
    return { token, expires_in: ttl, jti };
  }

  async isMfaPendingAlive(jti: string): Promise<boolean> {
    return (await this.redis.get(this.mfaPendingKey(jti))) !== null;
  }

  /** Single-use: delete the challenge after a successful verification. */
  async consumeMfaPending(jti: string): Promise<void> {
    await this.redis.del(this.mfaPendingKey(jti));
  }

  /**
   * Count a failed TOTP attempt; void the challenge entirely once the cap is
   * hit so a captured token cannot be brute-forced for its full TTL.
   */
  async recordMfaPendingFailure(jti: string, maxAttempts = 5): Promise<void> {
    const key = this.mfaPendingKey(jti);
    const raw = await this.redis.get(key);
    if (raw === null) return;
    const failures = Number(raw) + 1;
    if (failures >= maxAttempts) {
      await this.redis.del(key);
      return;
    }
    const env = loadEnv();
    await this.redis.setEx(key, String(failures), parseDuration(env.JWT_ADMIN_MFA_PENDING_TTL));
  }

  verifyMfaPending(token: string): AdminMfaPendingClaims {
    const env = loadEnv();
    try {
      const payload = jwt.verify(token, env.JWT_ADMIN_SECRET, {
        algorithms: ["HS256"],
        issuer: ISS,
        audience: ADMIN_AUD,
      }) as AdminMfaPendingClaims;
      if (payload.realm !== "admin") throw new Error("realm mismatch");
      if (payload.typ !== "mfa_pending") throw new Error("token type mismatch");
      return payload;
    } catch {
      throw new UnauthorizedException({
        code: "mfa_pending_invalid",
        message: "MFA challenge token invalid or expired",
      });
    }
  }

  // ─── access + refresh pair (8h / 8h) ───────────────────────────────
  async mintAccessPair(p: {
    platformUserId: string;
    email: string;
    role: string;
    mfaVerifiedAt: number;
  }): Promise<AdminTokenPair> {
    const env = loadEnv();
    const accessTtl = parseDuration(env.JWT_ADMIN_ACCESS_TTL);
    const refreshTtl = parseDuration(env.JWT_ADMIN_REFRESH_TTL);
    const accessJti = randomUUID();
    const refreshJti = randomUUID();

    const baseOpts: SignOptions = {
      algorithm: "HS256",
      issuer: ISS,
      audience: ADMIN_AUD,
    };

    const accessPayload = {
      sub: p.platformUserId,
      platform_user_id: p.platformUserId,
      email: p.email,
      role: p.role,
      mfa_verified_at: p.mfaVerifiedAt,
      realm: "admin" as const,
      typ: "access" as const,
    };
    const refreshPayload = {
      sub: p.platformUserId,
      platform_user_id: p.platformUserId,
      email: p.email,
      role: p.role,
      // Carried through rotation so a refreshed session keeps the ORIGINAL
      // MFA time — refreshing must never look like a fresh MFA verification.
      mfa_verified_at: p.mfaVerifiedAt,
      realm: "admin" as const,
      typ: "refresh" as const,
    };

    const accessToken = jwt.sign(accessPayload, env.JWT_ADMIN_SECRET, {
      ...baseOpts,
      expiresIn: accessTtl,
      jwtid: accessJti,
    });
    const refreshToken = jwt.sign(refreshPayload, env.JWT_ADMIN_SECRET, {
      ...baseOpts,
      expiresIn: refreshTtl,
      jwtid: refreshJti,
    });

    await this.redis.setEx(
      this.refreshKey(p.platformUserId, refreshJti),
      JSON.stringify({ role: p.role, mintedAt: Date.now() }),
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

  verifyAccess(token: string): AdminAccessClaims {
    const env = loadEnv();
    try {
      const payload = jwt.verify(token, env.JWT_ADMIN_SECRET, {
        algorithms: ["HS256"],
        issuer: ISS,
        audience: ADMIN_AUD,
      }) as AdminAccessClaims;
      if (payload.realm !== "admin") throw new Error("realm mismatch");
      if (payload.typ !== "access") throw new Error("token type mismatch");
      return payload;
    } catch {
      throw new UnauthorizedException({
        code: "admin_access_expired",
        message: "Admin access token invalid or expired",
      });
    }
  }

  verifyRefresh(token: string): AdminRefreshClaims {
    const env = loadEnv();
    try {
      const payload = jwt.verify(token, env.JWT_ADMIN_SECRET, {
        algorithms: ["HS256"],
        issuer: ISS,
        audience: ADMIN_AUD,
      }) as AdminRefreshClaims;
      if (payload.realm !== "admin") throw new Error("realm mismatch");
      if (payload.typ !== "refresh") throw new Error("token type mismatch");
      return payload;
    } catch {
      throw new UnauthorizedException({
        code: "admin_refresh_invalid",
        message: "Admin refresh token invalid or expired",
      });
    }
  }

  async isRefreshAlive(platformUserId: string, jti: string): Promise<boolean> {
    const v = await this.redis.get(this.refreshKey(platformUserId, jti));
    return v !== null;
  }

  async revokeRefresh(platformUserId: string, jti: string): Promise<void> {
    await this.redis.del(this.refreshKey(platformUserId, jti));
  }

  async revokeRefreshFamily(platformUserId: string): Promise<void> {
    await this.redis.delByPattern(this.refreshKey(platformUserId, "*"));
  }

  private refreshKey(platformUserId: string, jti: string): string {
    return `admin_refresh:${platformUserId}:${jti}`;
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
