import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import type { Request } from "express";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { RateLimit, RateLimitGuard } from "../../common/rate-limit.guard";
import { Idempotent, IdempotencyInterceptor } from "../../common/idempotency.interceptor";
import { getClientIp, getUserAgent } from "../../common/request-context";
import { CurrentUser, type TenantPrincipal } from "../auth/current-user.decorator";
import { assertNotImpersonating } from "../auth/impersonation.helper";
import { UsersService } from "./users.service";
import { ListUsersQuerySchema, type ListUsersQuery } from "./dto/list-users.dto";
import { InviteUserSchema, type InviteUserBody } from "./dto/invite-user.dto";
import { UpdateUserSchema, type UpdateUserBody } from "./dto/update-user.dto";

function buildCtx(user: TenantPrincipal, req: Request) {
  return {
    tenantId: user.tenantId,
    userId: user.userId,
    ip: getClientIp(req),
    userAgent: getUserAgent(req),
    ...(user.impersonatorId ? { impersonatorId: user.impersonatorId } : {}),
  };
}

@Controller("v1/users")
@UseGuards(RateLimitGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RateLimit({ max: 60, windowMs: 60_000 })
  async list(
    @CurrentUser() user: TenantPrincipal,
    @Query(new ZodValidationPipe(ListUsersQuerySchema)) q: ListUsersQuery,
  ) {
    this.users.assertOwner(user.role);
    return this.users.list(user.tenantId, q);
  }

  // Open to any authed tenant user — needed by the refund wizard's manager-
  // approval modal where a cashier picks an active owner/manager. Backend
  // re-verifies the picked role on POST /v1/sale-refunds.
  @Get("approvers")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async approvers(@CurrentUser() user: TenantPrincipal) {
    return this.users.listApprovers(user.tenantId);
  }

  @Post("invite")
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  @Idempotent()
  @RateLimit({ max: 30, windowMs: 60_000 })
  async invite(
    @CurrentUser() user: TenantPrincipal,
    @Body(new ZodValidationPipe(InviteUserSchema)) body: InviteUserBody,
    @Req() req: Request,
  ) {
    this.users.assertOwner(user.role);
    return this.users.invite(user.tenantId, user.userId, body, buildCtx(user, req));
  }

  @Patch(":id")
  @RateLimit({ max: 30, windowMs: 60_000 })
  async update(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateUserSchema)) body: UpdateUserBody,
    @Req() req: Request,
  ) {
    this.users.assertOwner(user.role);
    return this.users.update(user.tenantId, id, user.userId, body, buildCtx(user, req));
  }

  @Post(":id/resend-invite")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ max: 30, windowMs: 60_000 })
  async resendInvite(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    this.users.assertOwner(user.role);
    return this.users.resendInvite(user.tenantId, id, user.userId, buildCtx(user, req));
  }

  @Post(":id/reset-password")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ max: 5, windowMs: 60_000 })
  async resetPassword(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    this.users.assertOwner(user.role);
    assertNotImpersonating(user, "user_reset_password");
    return this.users.initiatePasswordReset(
      user.tenantId,
      id,
      user.userId,
      buildCtx(user, req),
    );
  }
}
