import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { CurrentAdmin, type AdminPrincipal } from "../auth/current-admin.decorator";
import { RateLimit, RateLimitGuard } from "../../common/rate-limit.guard";
import { getClientIp, getUserAgent } from "../../common/request-context";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import {
  AcceptInviteSchema,
  InviteMemberSchema,
  UpdateRoleSchema,
  type AcceptInviteInput,
  type InviteMemberInput,
  type UpdateRoleInput,
} from "./dto/team-schemas";
import { TeamService } from "./team.service";

@Controller("v1/admin/team")
@UseGuards(RateLimitGuard)
export class TeamController {
  constructor(private readonly team: TeamService) {}

  @Get()
  @UseGuards(AdminAuthGuard)
  @RateLimit({ max: 60, windowMs: 60_000 })
  async list(@CurrentAdmin() admin: AdminPrincipal) {
    requireOwner(admin);
    return this.team.list();
  }

  @Post("invite")
  @UseGuards(AdminAuthGuard)
  @RateLimit({ max: 10, windowMs: 60_000 })
  async invite(
    @CurrentAdmin() admin: AdminPrincipal,
    @Body(new ZodValidationPipe(InviteMemberSchema)) body: InviteMemberInput,
    @Req() req: Request,
  ) {
    requireOwner(admin);
    return this.team.invite(body, buildCtx(admin, req));
  }

  @Patch(":id/role")
  @UseGuards(AdminAuthGuard)
  @RateLimit({ max: 20, windowMs: 60_000 })
  async updateRole(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateRoleSchema)) body: UpdateRoleInput,
    @Req() req: Request,
  ) {
    requireOwner(admin);
    return this.team.updateRole(id, body, buildCtx(admin, req));
  }

  @Post(":id/deactivate")
  @UseGuards(AdminAuthGuard)
  @RateLimit({ max: 20, windowMs: 60_000 })
  async deactivate(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    requireOwner(admin);
    return this.team.deactivate(id, buildCtx(admin, req));
  }

  @Post(":id/reactivate")
  @UseGuards(AdminAuthGuard)
  @RateLimit({ max: 20, windowMs: 60_000 })
  async reactivate(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    requireOwner(admin);
    return this.team.reactivate(id, buildCtx(admin, req));
  }

  @Post("accept-invite")
  @RateLimit({ max: 5, windowMs: 60_000 })
  async acceptInvite(
    @Body(new ZodValidationPipe(AcceptInviteSchema)) body: AcceptInviteInput,
  ) {
    await this.team.acceptInvite(body);
    return { ok: true };
  }
}

function requireOwner(admin: AdminPrincipal): void {
  if (admin.role !== "owner") {
    throw new ForbiddenException({
      code: "insufficient_permission",
      message: "Only the Platform Owner can manage team members.",
    });
  }
}

function buildCtx(admin: AdminPrincipal, req: Request) {
  return {
    platformUserId: admin.platformUserId,
    ip: getClientIp(req),
    userAgent: getUserAgent(req),
  };
}
