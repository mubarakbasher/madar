import {
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
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { RateLimit, RateLimitGuard } from "../../common/rate-limit.guard";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { getClientIp, getUserAgent } from "../../common/request-context";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { CurrentAdmin, type AdminPrincipal } from "../auth/current-admin.decorator";
import { PaymentProofsService } from "../../payment-proofs-shared/payment-proofs.service";
import {
  ListAdminProofsQuerySchema,
  type ListAdminProofsQuery,
} from "./dto/list-admin-proofs.dto";
import { AdminRejectProofSchema, type AdminRejectProofBody } from "./dto/reject-proof.dto";

const VERIFIER_ROLES = new Set(["owner", "finance"]);

@Controller("v1/admin/payment-proofs")
@UseGuards(RateLimitGuard, AdminAuthGuard)
export class AdminPaymentProofsController {
  constructor(private readonly proofs: PaymentProofsService) {}

  @Get()
  @RateLimit({ max: 60, windowMs: 60_000 })
  async list(
    @CurrentAdmin() admin: AdminPrincipal,
    @Query(new ZodValidationPipe(ListAdminProofsQuerySchema)) q: ListAdminProofsQuery,
    @Req() req: Request,
  ) {
    return this.proofs.list(
      {
        realm: "admin",
        userId: admin.platformUserId,
        tenantId: null,
        ip: getClientIp(req),
        userAgent: getUserAgent(req),
      },
      { context: q.context, status: q.status, tenantId: q.tenant_id, page: q.page, limit: q.limit },
    );
  }

  @Get(":id")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async getOne(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    return this.proofs.getOne(
      {
        realm: "admin",
        userId: admin.platformUserId,
        tenantId: null,
        ip: getClientIp(req),
        userAgent: getUserAgent(req),
      },
      id,
    );
  }

  @Get(":id/receipt")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async receipt(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const { buffer, mime, filename } = await this.proofs.streamReceipt(
      {
        realm: "admin",
        userId: admin.platformUserId,
        tenantId: null,
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
    @CurrentAdmin() admin: AdminPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    if (!VERIFIER_ROLES.has(admin.role)) {
      throw new ForbiddenException({
        code: "forbidden_role",
        message: "Only Platform Owner and Finance roles can verify subscription proofs",
      });
    }
    return this.proofs.verify(
      {
        realm: "admin",
        userId: admin.platformUserId,
        tenantId: null,
        ip: getClientIp(req),
        userAgent: getUserAgent(req),
      },
      id,
      ["subscription"],
    );
  }

  @Post(":id/reject")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ max: 30, windowMs: 60_000 })
  async reject(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(AdminRejectProofSchema)) body: AdminRejectProofBody,
    @Req() req: Request,
  ) {
    if (!VERIFIER_ROLES.has(admin.role)) {
      throw new ForbiddenException({
        code: "forbidden_role",
        message: "Only Platform Owner and Finance roles can reject subscription proofs",
      });
    }
    return this.proofs.reject(
      {
        realm: "admin",
        userId: admin.platformUserId,
        tenantId: null,
        ip: getClientIp(req),
        userAgent: getUserAgent(req),
      },
      id,
      ["subscription"],
      body.rejection_reason,
      body.notes,
    );
  }
}
