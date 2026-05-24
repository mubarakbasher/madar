import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import argon2 from "argon2";
// User-management flows here all run inside a resolved tenant context, so
// every query goes through `tenantScoped`. `adminPrisma` is used only to
// resolve tenant display name for the invite email (tenants is a platform
// table not under RLS, same pattern as suppliers/branches).
// eslint-disable-next-line no-restricted-imports
import { adminPrisma, tenantScoped } from "@madar/db";
import { AuditService, type AuditCtx } from "../auth/audit.service";
import { EmailService, pickLocale } from "../../common/email/email.service";
import { loadEnv } from "../../env";
import type { ListUsersQuery } from "./dto/list-users.dto";
import type { InviteUserBody } from "./dto/invite-user.dto";
import type { UpdateUserBody } from "./dto/update-user.dto";

const OWNER_ONLY = new Set(["owner"]);

// 7-day TTL for invitation links. The owner can re-send to refresh.
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Argon2id params for the throwaway password we mint when inviting a user.
// They can never log in with it; they must click the invite link and set a
// real password via the existing reset-password flow. Match the AuthService
// params so the hash format is consistent across the codebase.
const ARGON2_PARAMS = {
  type: 2, // argon2id
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
} as const;

export type TenantUserRole = "owner" | "manager" | "cashier" | "accountant" | "auditor";

export interface ApiUserSummary {
  id: string;
  email: string;
  name: string;
  role: TenantUserRole;
  branch_id: string | null;
  branch_code: string | null;
  branch_name_i18n: { en: string; ar: string } | null;
  is_active: boolean;
  mfa_enabled: boolean;
  email_verified: boolean;
  has_pending_invite: boolean;
  created_at: string;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly audit: AuditService,
    private readonly email: EmailService,
  ) {}

  // ─── role gates ────────────────────────────────────────────────────

  assertOwner(role: string): void {
    if (!OWNER_ONLY.has(role)) {
      throw new ForbiddenException({
        code: "forbidden_role",
        message: "Only the owner can manage users",
      });
    }
  }

  // ─── list ──────────────────────────────────────────────────────────

  async list(
    tenantId: string,
    q: ListUsersQuery,
  ): Promise<{ items: ApiUserSummary[]; total: number; page: number; limit: number }> {
    const scoped = tenantScoped(tenantId);
    const skip = (q.page - 1) * q.limit;

    const where: Record<string, unknown> = {
      deleted_at: null,
    };
    if (q.active_only === true) where.is_active = true;
    if (q.search) {
      where.OR = [
        { email: { contains: q.search, mode: "insensitive" } },
        { name: { contains: q.search, mode: "insensitive" } },
      ];
    }

    const [rows, total] = await Promise.all([
      scoped.user.findMany({
        where,
        orderBy: [{ created_at: "desc" }],
        skip,
        take: q.limit,
      }),
      scoped.user.count({ where }),
    ]);

    const branchIds = rows
      .map((r) => r.branch_id)
      .filter((id): id is string => !!id);
    const branchById = await this.loadBranches(tenantId, branchIds);

    return {
      items: rows.map((r) =>
        this.toSummary(r, r.branch_id ? branchById.get(r.branch_id) ?? null : null),
      ),
      total,
      page: q.page,
      limit: q.limit,
    };
  }

  // Slim approver lookup for the refund wizard. Any authed tenant user can call
  // this — the answer (active owners + managers) is not sensitive. Backend
  // re-verifies the picked user's role on POST /v1/sale-refunds.
  async listApprovers(
    tenantId: string,
  ): Promise<{ items: Array<{ id: string; name: string; role: "owner" | "manager" }> }> {
    const scoped = tenantScoped(tenantId);
    const rows = await scoped.user.findMany({
      where: {
        role: { in: ["owner", "manager"] },
        is_active: true,
        deleted_at: null,
      },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    });
    return {
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        role: r.role as "owner" | "manager",
      })),
    };
  }

  private async loadBranches(
    tenantId: string,
    branchIds: string[],
  ): Promise<Map<string, { id: string; code: string; name_i18n: unknown }>> {
    if (branchIds.length === 0) return new Map();
    const uniq = Array.from(new Set(branchIds));
    const rows = await tenantScoped(tenantId).branch.findMany({
      where: { id: { in: uniq } },
      select: { id: true, code: true, name_i18n: true },
    });
    return new Map(rows.map((b) => [b.id, b]));
  }

  // ─── invite ────────────────────────────────────────────────────────

  async invite(
    tenantId: string,
    actorId: string,
    body: InviteUserBody,
    ctx: AuditCtx,
  ): Promise<ApiUserSummary> {
    const email = body.email.trim().toLowerCase();

    // manager_requires_branch — caught up-front so the user gets the most
    // helpful error message (the same rule re-fires inside `update` for edits).
    if (body.role === "manager" && (body.branch_id === undefined || body.branch_id === null)) {
      throw new BadRequestException({
        code: "manager_requires_branch",
        message: "Managers must be assigned to a branch",
      });
    }

    if (body.branch_id) {
      await this.assertActiveBranch(tenantId, body.branch_id);
    }

    // Uniqueness check — soft-deleted matches count as taken; we don't recycle
    // emails for invitee re-creation. Use adminPrisma so we can see soft-deleted
    // rows (RLS would hide them via the tenant client).
    const collision = await adminPrisma.user.findFirst({
      where: { tenant_id: tenantId, email },
      select: { id: true },
    });
    if (collision) {
      throw new ConflictException({
        code: "email_taken",
        message: "A teammate with this email already exists",
        fields: { email: "email_taken" },
      });
    }

    const env = loadEnv();
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = sha256Hex(rawToken);
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    // Generate an unguessable password hash so the row satisfies the NOT NULL
    // constraint. The invitee MUST go through the reset-password flow to log in.
    const decoySecret = randomBytes(32).toString("hex");
    const passwordHash = await argon2.hash(decoySecret, ARGON2_PARAMS);

    const scoped = tenantScoped(tenantId);
    const tenant = await adminPrisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, default_locale: true },
    });
    const inviter = await scoped.user.findUnique({
      where: { id: actorId },
      select: { name: true, locale: true },
    });

    const created = await scoped.user.create({
      data: {
        tenant_id: tenantId,
        email,
        name: body.name,
        role: body.role,
        branch_id: body.branch_id ?? null,
        password_hash: passwordHash,
        password_reset_token_hash: tokenHash,
        password_reset_expires_at: expiresAt,
        is_active: true,
        email_verified: false,
        mfa_enabled: false,
        locale: tenant?.default_locale ?? "en",
        created_by: actorId,
      },
    });
    const branchById = await this.loadBranches(
      tenantId,
      created.branch_id ? [created.branch_id] : [],
    );

    // Best-effort email — failure logs but does not roll back the user row.
    // The owner can resend via /v1/users/:id/resend-invite.
    const locale = pickLocale(tenant?.default_locale ?? "en");
    const acceptUrl = `${env.TENANT_WEB_ORIGIN}/${locale}/reset-password?token=${rawToken}`;
    this.email
      .send({
        template: "staff_invite",
        to: email,
        locale,
        vars: {
          inviterName: inviter?.name ?? "Your owner",
          inviteeName: body.name,
          tenantName: tenant?.name ?? "your shop",
          role: body.role,
          acceptUrl,
          expiresAt: expiresAt.toISOString(),
        },
      })
      .catch((e) => this.logger.warn(`staff_invite email failed: ${(e as Error).message}`));

    await this.audit
      .writeTenantScoped(ctx, {
        action: "user_invited",
        entity: "user",
        entityId: created.id,
        after: {
          user_id: created.id,
          email: created.email,
          role: created.role,
          branch_id: created.branch_id,
          invited_owner: created.role === "owner",
        },
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return this.toSummary(
      created,
      created.branch_id ? branchById.get(created.branch_id) ?? null : null,
    );
  }

  // ─── patch ─────────────────────────────────────────────────────────

  async update(
    tenantId: string,
    targetId: string,
    actorId: string,
    body: UpdateUserBody,
    ctx: AuditCtx,
  ): Promise<ApiUserSummary> {
    if (targetId === actorId) {
      throw new BadRequestException({
        code: "cannot_edit_self",
        message: "You can't edit your own membership — ask another owner to change your role or status",
      });
    }

    const scoped = tenantScoped(tenantId);
    const existing = await scoped.user.findUnique({
      where: { id: targetId },
    });
    if (!existing || existing.deleted_at || existing.tenant_id !== tenantId) {
      throw new UnprocessableEntityException({
        code: "unknown_user",
        message: "User not found",
      });
    }

    // Resolve the post-update state for invariant checks (manager_requires_branch
    // and last_owner_lock both reason about "what would be true after this write").
    const nextRole = body.role !== undefined ? body.role : (existing.role as TenantUserRole);
    const nextBranchId =
      body.branch_id !== undefined ? body.branch_id : existing.branch_id;
    const nextIsActive = body.is_active !== undefined ? body.is_active : existing.is_active;

    if (nextRole === "manager" && (nextBranchId === null || nextBranchId === undefined)) {
      throw new BadRequestException({
        code: "manager_requires_branch",
        message: "Managers must be assigned to a branch",
      });
    }

    if (body.branch_id !== undefined && body.branch_id !== null) {
      await this.assertActiveBranch(tenantId, body.branch_id);
    }

    // last_owner_lock — count other active owners. If the post-update state
    // would yield zero active owners (this user is/was the only one and is
    // being demoted or deactivated), reject.
    const targetIsActiveOwnerAfter = nextRole === "owner" && nextIsActive === true;
    const otherActiveOwners = await scoped.user.count({
      where: {
        role: "owner",
        is_active: true,
        deleted_at: null,
        NOT: { id: targetId },
      },
    });
    if (!targetIsActiveOwnerAfter && otherActiveOwners === 0) {
      throw new ConflictException({
        code: "last_owner_lock",
        message: "Can't remove the last active owner. Promote someone else first.",
      });
    }

    // Compute before/after deltas of only the columns that actually changed.
    const data: Record<string, unknown> = {};
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};

    if (body.role !== undefined && body.role !== existing.role) {
      data.role = body.role;
      before.role = existing.role;
      after.role = body.role;
    }
    if (body.branch_id !== undefined && body.branch_id !== existing.branch_id) {
      data.branch_id = body.branch_id;
      before.branch_id = existing.branch_id;
      after.branch_id = body.branch_id;
    }
    if (body.is_active !== undefined && body.is_active !== existing.is_active) {
      data.is_active = body.is_active;
      before.is_active = existing.is_active;
      after.is_active = body.is_active;
    }

    if (Object.keys(data).length === 0) {
      // No-op — return the existing row.
      const existingBranch = await this.loadBranches(
        tenantId,
        existing.branch_id ? [existing.branch_id] : [],
      );
      return this.toSummary(
        existing,
        existing.branch_id ? existingBranch.get(existing.branch_id) ?? null : null,
      );
    }

    const updated = await scoped.user.update({
      where: { id: targetId },
      data,
    });
    const updatedBranch = await this.loadBranches(
      tenantId,
      updated.branch_id ? [updated.branch_id] : [],
    );

    await this.audit
      .writeTenantScoped(ctx, {
        action: "user_updated",
        entity: "user",
        entityId: targetId,
        before,
        after,
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return this.toSummary(
      updated,
      updated.branch_id ? updatedBranch.get(updated.branch_id) ?? null : null,
    );
  }

  // ─── resend invite ─────────────────────────────────────────────────

  /**
   * Overwrite the user's password_reset token and resend the invite email.
   * Idempotency: always-allow. Calling twice in quick succession just rotates
   * the token. We don't gate on "user_already_active" — the failure case is
   * harmless (the new token simply won't get used).
   */
  async resendInvite(
    tenantId: string,
    targetId: string,
    actorId: string,
    ctx: AuditCtx,
  ): Promise<{ id: string; expires_at: string }> {
    if (targetId === actorId) {
      throw new BadRequestException({
        code: "cannot_resend_self",
        message: "You can't resend an invite to yourself",
      });
    }

    const scoped = tenantScoped(tenantId);
    const target = await scoped.user.findUnique({
      where: { id: targetId },
    });
    if (!target || target.deleted_at || target.tenant_id !== tenantId) {
      throw new UnprocessableEntityException({
        code: "unknown_user",
        message: "User not found",
      });
    }

    const env = loadEnv();
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = sha256Hex(rawToken);
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    await scoped.user.update({
      where: { id: targetId },
      data: {
        password_reset_token_hash: tokenHash,
        password_reset_expires_at: expiresAt,
      },
    });

    const tenant = await adminPrisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, default_locale: true },
    });
    const inviter = await scoped.user.findUnique({
      where: { id: actorId },
      select: { name: true },
    });
    const locale = pickLocale(target.locale ?? tenant?.default_locale ?? "en");
    const acceptUrl = `${env.TENANT_WEB_ORIGIN}/${locale}/reset-password?token=${rawToken}`;
    this.email
      .send({
        template: "staff_invite",
        to: target.email,
        locale,
        vars: {
          inviterName: inviter?.name ?? "Your owner",
          inviteeName: target.name,
          tenantName: tenant?.name ?? "your shop",
          role: target.role,
          acceptUrl,
          expiresAt: expiresAt.toISOString(),
        },
      })
      .catch((e) => this.logger.warn(`staff_invite resend email failed: ${(e as Error).message}`));

    await this.audit
      .writeTenantScoped(ctx, {
        action: "user_invite_resent",
        entity: "user",
        entityId: targetId,
        after: { user_id: targetId, email: target.email },
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return { id: targetId, expires_at: expiresAt.toISOString() };
  }

  // Owner-initiated password reset (#7). Mints a reset token, stamps it on
  // the user row, sends the `password_reset` email to the user's address.
  // Owner never sees the raw token — they read the .eml on disk-provider, or
  // the staff member reads the inbox on resend.
  async initiatePasswordReset(
    tenantId: string,
    targetId: string,
    actorId: string,
    ctx: AuditCtx,
  ): Promise<{ id: string; expires_at: string }> {
    if (targetId === actorId) {
      throw new BadRequestException({
        code: "cannot_reset_self",
        message: "Use the Profile page to change your own password",
      });
    }

    const scoped = tenantScoped(tenantId);
    const target = await scoped.user.findUnique({ where: { id: targetId } });
    if (!target || target.deleted_at || target.tenant_id !== tenantId) {
      throw new UnprocessableEntityException({
        code: "unknown_user",
        message: "User not found",
      });
    }

    const env = loadEnv();
    const ttlHours = env.PASSWORD_RESET_TTL_HOURS;
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = sha256Hex(rawToken);
    const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000);

    await scoped.user.update({
      where: { id: targetId },
      data: {
        password_reset_token_hash: tokenHash,
        password_reset_expires_at: expiresAt,
      },
    });

    const tenant = await adminPrisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, default_locale: true },
    });
    const locale = pickLocale(target.locale ?? tenant?.default_locale ?? "en");
    const resetUrl = `${env.TENANT_WEB_ORIGIN}/${locale}/reset-password?token=${rawToken}`;
    this.email
      .send({
        template: "password_reset",
        to: target.email,
        locale,
        vars: {
          userName: target.name,
          tenantName: tenant?.name ?? "your shop",
          resetUrl,
          expiresInHours: ttlHours,
        },
      })
      .catch((e) =>
        this.logger.warn(`password_reset email failed: ${(e as Error).message}`),
      );

    await this.audit
      .writeTenantScoped(ctx, {
        action: "user_password_reset_initiated",
        entity: "user",
        entityId: targetId,
        after: { user_id: targetId, email: target.email, expires_at: expiresAt.toISOString() },
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return { id: targetId, expires_at: expiresAt.toISOString() };
  }

  // ─── helpers ───────────────────────────────────────────────────────

  private async assertActiveBranch(tenantId: string, branchId: string): Promise<void> {
    const branch = await tenantScoped(tenantId).branch.findUnique({
      where: { id: branchId },
      select: { id: true, is_active: true, deleted_at: true },
    });
    if (!branch || branch.deleted_at || !branch.is_active) {
      throw new UnprocessableEntityException({
        code: "unknown_branch",
        message: "Branch not found or inactive",
      });
    }
  }

  private toSummary(
    row: {
      id: string;
      email: string;
      name: string;
      role: string;
      branch_id: string | null;
      is_active: boolean;
      mfa_enabled: boolean;
      email_verified: boolean;
      password_reset_token_hash: string | null;
      password_reset_expires_at: Date | null;
      created_at: Date;
    },
    branch: { id: string; code: string; name_i18n: unknown } | null,
  ): ApiUserSummary {
    const now = Date.now();
    const hasPending =
      !!row.password_reset_token_hash &&
      row.password_reset_expires_at !== null &&
      row.password_reset_expires_at.getTime() > now;

    return {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role as TenantUserRole,
      branch_id: row.branch_id,
      branch_code: branch?.code ?? null,
      branch_name_i18n:
        (branch?.name_i18n as { en: string; ar: string } | undefined) ?? null,
      is_active: row.is_active,
      mfa_enabled: row.mfa_enabled,
      email_verified: row.email_verified,
      has_pending_invite: hasPending,
      created_at: row.created_at.toISOString(),
    };
  }
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
