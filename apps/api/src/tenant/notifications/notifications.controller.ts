import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { RateLimit, RateLimitGuard } from "../../common/rate-limit.guard";
import { getClientIp, getUserAgent } from "../../common/request-context";
import { CurrentUser, type TenantPrincipal } from "../auth/current-user.decorator";
import { NotificationsService } from "./notifications.service";
import {
  UpdatePreferencesSchema,
  type UpdatePreferencesInput,
} from "./dto/update-preferences.dto";

@Controller("v1/notifications")
@UseGuards(RateLimitGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get("preferences")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async getPreferences(@CurrentUser() user: TenantPrincipal) {
    return this.notifications.getMatrix(user.tenantId, user.role);
  }

  @Patch("preferences")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ max: 30, windowMs: 60_000 })
  async updatePreferences(
    @CurrentUser() user: TenantPrincipal,
    @Body(new ZodValidationPipe(UpdatePreferencesSchema)) body: UpdatePreferencesInput,
    @Req() req: Request,
  ) {
    return this.notifications.updateMatrix(user.tenantId, user.role, body, {
      tenantId: user.tenantId,
      userId: user.userId,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      ...(user.impersonatorId ? { impersonatorId: user.impersonatorId } : {}),
    });
  }
}
