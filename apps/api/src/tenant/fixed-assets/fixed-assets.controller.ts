import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
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
import { FixedAssetsService } from "./fixed-assets.service";
import { CreateFixedAssetSchema, type CreateFixedAssetBody } from "./dto/create-fixed-asset.dto";
import { UpdateFixedAssetSchema, type UpdateFixedAssetBody } from "./dto/update-fixed-asset.dto";
import { ListFixedAssetsQuerySchema, type ListFixedAssetsQuery } from "./dto/list-fixed-assets.dto";

const OWNER_OR_MANAGER = new Set(["owner", "manager"]);

function assertCanWrite(user: TenantPrincipal): void {
  if (!OWNER_OR_MANAGER.has(user.role)) {
    throw new ForbiddenException({
      code: "forbidden_role",
      message: "Only owners and managers may modify assets",
    });
  }
}

function buildCtx(user: TenantPrincipal, req: Request) {
  return {
    tenantId: user.tenantId,
    userId: user.userId,
    ip: getClientIp(req),
    userAgent: getUserAgent(req),
    ...(user.impersonatorId ? { impersonatorId: user.impersonatorId } : {}),
  };
}

@Controller("v1/assets")
@UseGuards(RateLimitGuard)
export class FixedAssetsController {
  constructor(private readonly assets: FixedAssetsService) {}

  @Get()
  @RateLimit({ max: 60, windowMs: 60_000 })
  async list(
    @CurrentUser() user: TenantPrincipal,
    @Query(new ZodValidationPipe(ListFixedAssetsQuerySchema)) q: ListFixedAssetsQuery,
  ) {
    return this.assets.list(user.tenantId, q);
  }

  @Get(":id")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async getOne(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.assets.getOne(user.tenantId, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  @Idempotent()
  @RateLimit({ max: 30, windowMs: 60_000 })
  async create(
    @CurrentUser() user: TenantPrincipal,
    @Body(new ZodValidationPipe(CreateFixedAssetSchema)) body: CreateFixedAssetBody,
    @Req() req: Request,
  ) {
    assertCanWrite(user);
    return this.assets.create(user.tenantId, user.userId, body, buildCtx(user, req));
  }

  @Patch(":id")
  @RateLimit({ max: 30, windowMs: 60_000 })
  async update(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateFixedAssetSchema)) body: UpdateFixedAssetBody,
    @Req() req: Request,
  ) {
    assertCanWrite(user);
    return this.assets.update(user.tenantId, id, body, buildCtx(user, req));
  }

  @Delete(":id")
  @RateLimit({ max: 30, windowMs: 60_000 })
  async remove(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    assertCanWrite(user);
    assertNotImpersonating(user, "delete_fixed_asset");
    return this.assets.softDelete(user.tenantId, id, buildCtx(user, req));
  }
}
