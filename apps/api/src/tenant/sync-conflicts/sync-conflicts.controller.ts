import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
import { SyncConflictsService } from "./sync-conflicts.service";
import { ListSyncConflictsSchema, type ListSyncConflictsQuery } from "./dto/list.dto";
import { ResolveSyncConflictSchema, type ResolveSyncConflictBody } from "./dto/resolve.dto";

function buildCtx(user: TenantPrincipal, req: Request) {
  return {
    tenantId: user.tenantId,
    userId: user.userId,
    ip: getClientIp(req),
    userAgent: getUserAgent(req),
    ...(user.impersonatorId ? { impersonatorId: user.impersonatorId } : {}),
  };
}

@Controller("v1/sync-conflicts")
@UseGuards(RateLimitGuard)
export class SyncConflictsController {
  constructor(private readonly conflicts: SyncConflictsService) {}

  @Get()
  @RateLimit({ max: 60, windowMs: 60_000 })
  async list(
    @CurrentUser() user: TenantPrincipal,
    @Query(new ZodValidationPipe(ListSyncConflictsSchema)) q: ListSyncConflictsQuery,
  ) {
    this.conflicts.assertCanRead(user.role);
    return this.conflicts.list(user.tenantId, q);
  }

  @Get("summary")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async summary(@CurrentUser() user: TenantPrincipal) {
    this.conflicts.assertCanRead(user.role);
    return this.conflicts.summary(user.tenantId);
  }

  @Post(":id/resolve")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  @Idempotent()
  @RateLimit({ max: 30, windowMs: 60_000 })
  async resolve(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(ResolveSyncConflictSchema)) body: ResolveSyncConflictBody,
    @Req() req: Request,
  ) {
    this.conflicts.assertCanResolve(user.role);
    return this.conflicts.resolve(user.tenantId, id, user.userId, body, buildCtx(user, req));
  }
}
