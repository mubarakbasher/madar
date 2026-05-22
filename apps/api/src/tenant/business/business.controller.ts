import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request, Response } from "express";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { RateLimit, RateLimitGuard } from "../../common/rate-limit.guard";
import { getClientIp, getUserAgent } from "../../common/request-context";
import { CurrentUser, type TenantPrincipal } from "../auth/current-user.decorator";
import { Public } from "../auth/public.decorator";
import { BusinessService } from "./business.service";
import {
  UpdateBusinessSchema,
  type UpdateBusinessInput,
} from "./dto/update-business.dto";

function buildCtx(user: TenantPrincipal, req: Request) {
  return {
    tenantId: user.tenantId,
    userId: user.userId,
    ip: getClientIp(req),
    userAgent: getUserAgent(req),
    ...(user.impersonatorId ? { impersonatorId: user.impersonatorId } : {}),
  };
}

@Controller("v1")
@UseGuards(RateLimitGuard)
export class BusinessController {
  constructor(private readonly business: BusinessService) {}

  @Get("tenant")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async get(@CurrentUser() user: TenantPrincipal) {
    return this.business.get(user.tenantId);
  }

  @Patch("tenant")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ max: 30, windowMs: 60_000 })
  async update(
    @CurrentUser() user: TenantPrincipal,
    @Body(new ZodValidationPipe(UpdateBusinessSchema)) body: UpdateBusinessInput,
    @Req() req: Request,
  ) {
    return this.business.update(user.tenantId, user.role, body, buildCtx(user, req));
  }

  // ─── Logo upload (Slice 4 — PAGES §48) ──────────────────────────────

  @Post("tenant/logo")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor("image", { limits: { fileSize: 5 * 1024 * 1024 } }))
  @RateLimit({ max: 20, windowMs: 60_000 })
  async uploadLogo(
    @CurrentUser() user: TenantPrincipal,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
  ) {
    if (!file) {
      throw new BadRequestException({
        code: "image_required",
        message: "Multipart field 'image' is required",
      });
    }
    return this.business.setLogo(
      user.tenantId,
      user.role,
      user.userId,
      { buffer: file.buffer, declaredMime: file.mimetype, originalName: file.originalname },
      buildCtx(user, req),
    );
  }

  @Delete("tenant/logo")
  @RateLimit({ max: 30, windowMs: 60_000 })
  async clearLogo(@CurrentUser() user: TenantPrincipal, @Req() req: Request) {
    return this.business.clearLogo(user.tenantId, user.role, user.userId, buildCtx(user, req));
  }

  @Get("tenant/logo")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async streamLogo(
    @CurrentUser() user: TenantPrincipal,
    @Res() res: Response,
  ) {
    const { buffer, mime, filename } = await this.business.streamLogo(user.tenantId);
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.setHeader("Cache-Control", "private, max-age=300");
    res.send(buffer);
  }

  /**
   * Public read endpoint for the tenant logo. Required for raw `<img src>`
   * tags on receipts (no Bearer header available). Mirrors the product-image
   * public path; rate-limited per IP.
   */
  @Public()
  @Get("public/tenants/:tenantId/logo")
  @RateLimit({ max: 120, windowMs: 60_000 })
  async publicLogo(
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @Res() res: Response,
  ) {
    const { buffer, mime, filename } = await this.business.streamLogo(tenantId);
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.setHeader("Cache-Control", "public, max-age=600, immutable");
    res.send(buffer);
  }
}
