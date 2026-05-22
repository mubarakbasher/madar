/// <reference types="multer" />
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request, Response } from "express";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { Idempotent, IdempotencyInterceptor } from "../../common/idempotency.interceptor";
import { RateLimit, RateLimitGuard } from "../../common/rate-limit.guard";
import { getClientIp, getUserAgent } from "../../common/request-context";
import { CurrentUser, type TenantPrincipal } from "../auth/current-user.decorator";
import { PaymentProofsService } from "../../payment-proofs-shared/payment-proofs.service";
import {
  SubmitProofSchema,
  type SubmitProofBody,
} from "./dto/submit-proof.dto";
import { ListProofsQuerySchema, type ListProofsQuery } from "./dto/list-proofs.dto";
import { RejectProofSchema, type RejectProofBody } from "./dto/reject-proof.dto";

const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
const VERIFIER_ROLES = new Set(["owner", "manager"]);

@Controller("v1/payment-proofs")
@UseGuards(RateLimitGuard)
export class PaymentProofsController {
  constructor(private readonly proofs: PaymentProofsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor("receipt", { limits: { fileSize: MAX_RECEIPT_BYTES } }),
    IdempotencyInterceptor,
  )
  @Idempotent()
  @RateLimit({ max: 30, windowMs: 60_000 })
  async submit(
    @CurrentUser() user: TenantPrincipal,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body(new ZodValidationPipe(SubmitProofSchema)) body: SubmitProofBody,
    @Req() req: Request,
  ) {
    if (!file) {
      throw new BadRequestException({
        code: "receipt_required",
        message: "Multipart field 'receipt' is required",
      });
    }
    return this.proofs.submit(
      body,
      {
        tenantId: user.tenantId,
        userId: user.userId,
        ip: getClientIp(req),
        userAgent: getUserAgent(req),
        ...(user.impersonatorId ? { impersonatorId: user.impersonatorId } : {}),
      },
      { buffer: file.buffer, declaredMime: file.mimetype, originalName: file.originalname },
    );
  }

  @Get()
  @RateLimit({ max: 60, windowMs: 60_000 })
  async list(
    @CurrentUser() user: TenantPrincipal,
    @Query(new ZodValidationPipe(ListProofsQuerySchema)) q: ListProofsQuery,
    @Req() req: Request,
  ) {
    return this.proofs.list(
      {
        realm: "tenant",
        userId: user.userId,
        tenantId: user.tenantId,
        ip: getClientIp(req),
        userAgent: getUserAgent(req),
      },
      { ...q, tenantId: user.tenantId },
    );
  }

  @Get(":id")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async getOne(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    return this.proofs.getOne(
      {
        realm: "tenant",
        userId: user.userId,
        tenantId: user.tenantId,
        ip: getClientIp(req),
        userAgent: getUserAgent(req),
      },
      id,
    );
  }

  @Get(":id/receipt")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async receipt(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const { buffer, mime, filename } = await this.proofs.streamReceipt(
      {
        realm: "tenant",
        userId: user.userId,
        tenantId: user.tenantId,
        ip: getClientIp(req),
        userAgent: getUserAgent(req),
      },
      id,
    );
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.setHeader("Cache-Control", "private, max-age=300");
    res.send(buffer);
  }

  @Post(":id/verify")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ max: 30, windowMs: 60_000 })
  async verify(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    if (!VERIFIER_ROLES.has(user.role)) {
      throw new ForbiddenException({
        code: "forbidden_role",
        message: "Only owners and managers can verify proofs",
      });
    }
    // Tenant verifier owns the `sale` context only.
    return this.proofs.verify(
      {
        realm: "tenant",
        userId: user.userId,
        tenantId: user.tenantId,
        ip: getClientIp(req),
        userAgent: getUserAgent(req),
        ...(user.impersonatorId ? { impersonatorId: user.impersonatorId } : {}),
      },
      id,
      ["sale"],
    );
  }

  @Post(":id/reject")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ max: 30, windowMs: 60_000 })
  async reject(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(RejectProofSchema)) body: RejectProofBody,
    @Req() req: Request,
  ) {
    if (!VERIFIER_ROLES.has(user.role)) {
      throw new ForbiddenException({
        code: "forbidden_role",
        message: "Only owners and managers can reject proofs",
      });
    }
    return this.proofs.reject(
      {
        realm: "tenant",
        userId: user.userId,
        tenantId: user.tenantId,
        ip: getClientIp(req),
        userAgent: getUserAgent(req),
        ...(user.impersonatorId ? { impersonatorId: user.impersonatorId } : {}),
      },
      id,
      ["sale"],
      body.rejection_reason,
      body.notes,
    );
  }
}
