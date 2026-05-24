import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import argon2 from "argon2";
import { adminPrisma } from "@madar/db";
import { AdminAuditService, type AdminAuditCtx } from "../auth/admin-audit.service";
import { EmailService } from "../../common/email/email.service";
import { loadEnv } from "../../env";
import type { AcceptInviteInput, InviteMemberInput, UpdateRoleInput } from "./dto/team-schemas";

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

@Injectable()
export class TeamService {
  private readonly logger = new Logger(TeamService.name);

  constructor(
    private readonly audit: AdminAuditService,
    private readonly email: EmailService,
  ) {}

  async list(): Promise<TeamMemberResponse[]> {
    const users = await adminPrisma.platformUser.findMany({
      orderBy: { created_at: "asc" },
    });
    return users.map((u) => this.toResponse(u));
  }

  async invite(input: InviteMemberInput, ctx: AdminAuditCtx): Promise<TeamMemberResponse> {
    const existing = await adminPrisma.platformUser.findUnique({
      where: { email: input.email },
    });
    if (existing) {
      throw new ConflictException({
        code: "email_taken",
        message: `A team member with email '${input.email}' already exists.`,
      });
    }

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const created = await adminPrisma.platformUser.create({
      data: {
        email: input.email,
        name: input.name,
        role: input.role,
        password_hash: "!not-set",
        is_active: false,
        invite_token_hash: tokenHash,
        invite_expires_at: expiresAt,
      },
    });

    const inviter = await adminPrisma.platformUser.findUnique({
      where: { id: ctx.platformUserId },
      select: { name: true },
    });

    const env = loadEnv();
    const acceptUrl = `${env.ADMIN_WEB_ORIGIN}/accept-invite?token=${rawToken}`;

    await this.email
      .send({
        template: "admin_invite",
        to: input.email,
        locale: "en",
        vars: {
          inviterName: inviter?.name ?? "Platform Owner",
          inviteeName: input.name,
          acceptUrl,
          expiresAt: expiresAt.toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          }),
        },
      })
      .catch((e) => this.logger.warn(`invite email send failed: ${(e as Error).message}`));

    await this.audit.write(ctx, {
      action: "team_member.invited",
      targetEntity: "platform_user",
      targetId: created.id,
      metadata: { email: input.email, role: input.role },
    });

    return this.toResponse(created);
  }

  async acceptInvite(input: AcceptInviteInput): Promise<void> {
    const tokenHash = createHash("sha256").update(input.token).digest("hex");

    const user = await adminPrisma.platformUser.findFirst({
      where: {
        invite_token_hash: tokenHash,
        invite_expires_at: { gt: new Date() },
        is_active: false,
      },
    });

    if (!user) {
      throw new BadRequestException({
        code: "invite_invalid",
        message: "Invite token is invalid or expired.",
      });
    }

    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
      hashLength: 32,
    });

    await adminPrisma.platformUser.update({
      where: { id: user.id },
      data: {
        password_hash: passwordHash,
        invite_token_hash: null,
        invite_expires_at: null,
        is_active: true,
        updated_at: new Date(),
      },
    });
  }

  async updateRole(id: string, input: UpdateRoleInput, ctx: AdminAuditCtx): Promise<TeamMemberResponse> {
    const user = await adminPrisma.platformUser.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException({
        code: "team_member_not_found",
        message: "Team member not found.",
      });
    }

    if (id === ctx.platformUserId) {
      throw new ForbiddenException({
        code: "cannot_edit_self",
        message: "You cannot change your own role.",
      });
    }

    if (user.role === "owner") {
      throw new ForbiddenException({
        code: "cannot_demote_owner",
        message: "The Platform Owner role cannot be changed.",
      });
    }

    const updated = await adminPrisma.platformUser.update({
      where: { id },
      data: { role: input.role, updated_at: new Date() },
    });

    await this.audit.write(ctx, {
      action: "team_member.role_updated",
      targetEntity: "platform_user",
      targetId: id,
      metadata: { from: user.role, to: input.role },
    });

    return this.toResponse(updated);
  }

  async deactivate(id: string, ctx: AdminAuditCtx): Promise<TeamMemberResponse> {
    const user = await adminPrisma.platformUser.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException({
        code: "team_member_not_found",
        message: "Team member not found.",
      });
    }

    if (id === ctx.platformUserId) {
      throw new ForbiddenException({
        code: "cannot_deactivate_self",
        message: "You cannot deactivate your own account.",
      });
    }

    if (user.role === "owner") {
      throw new ForbiddenException({
        code: "cannot_deactivate_owner",
        message: "The Platform Owner cannot be deactivated.",
      });
    }

    const updated = await adminPrisma.platformUser.update({
      where: { id },
      data: { is_active: false, updated_at: new Date() },
    });

    await this.audit.write(ctx, {
      action: "team_member.deactivated",
      targetEntity: "platform_user",
      targetId: id,
      metadata: { email: user.email },
    });

    return this.toResponse(updated);
  }

  async reactivate(id: string, ctx: AdminAuditCtx): Promise<TeamMemberResponse> {
    const user = await adminPrisma.platformUser.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException({
        code: "team_member_not_found",
        message: "Team member not found.",
      });
    }

    const updated = await adminPrisma.platformUser.update({
      where: { id },
      data: { is_active: true, updated_at: new Date() },
    });

    await this.audit.write(ctx, {
      action: "team_member.reactivated",
      targetEntity: "platform_user",
      targetId: id,
      metadata: { email: user.email },
    });

    return this.toResponse(updated);
  }

  private toResponse(u: {
    id: string;
    email: string;
    name: string;
    role: string;
    mfa_enabled: boolean;
    is_active: boolean;
    last_login_at: Date | null;
    created_at: Date;
    invite_token_hash: string | null;
    invite_expires_at: Date | null;
  }): TeamMemberResponse {
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      mfa_enabled: u.mfa_enabled,
      is_active: u.is_active,
      last_login_at: u.last_login_at?.toISOString() ?? null,
      created_at: u.created_at.toISOString(),
      has_pending_invite:
        !!u.invite_token_hash &&
        !!u.invite_expires_at &&
        u.invite_expires_at > new Date(),
    };
  }
}
