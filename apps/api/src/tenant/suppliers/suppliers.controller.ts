/// <reference types="multer" />
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
import { RateLimit, RateLimitGuard } from "../../common/rate-limit.guard";
import { Idempotent, IdempotencyInterceptor } from "../../common/idempotency.interceptor";
import { getClientIp, getUserAgent } from "../../common/request-context";
import { CurrentUser, type TenantPrincipal } from "../auth/current-user.decorator";
import { assertNotImpersonating } from "../auth/impersonation.helper";
import { SuppliersService } from "./suppliers.service";
import { ListSuppliersQuerySchema, type ListSuppliersQuery } from "./dto/list-suppliers.dto";
import { CreateSupplierSchema, type CreateSupplierBody } from "./dto/create-supplier.dto";
import { UpdateSupplierSchema, type UpdateSupplierBody } from "./dto/update-supplier.dto";
import { CatalogCreateSchema, type CatalogCreateBody } from "./dto/catalog-create.dto";
import { CatalogUpdateSchema, type CatalogUpdateBody } from "./dto/catalog-update.dto";
import {
  UploadSupplierDocumentSchema,
  type UploadSupplierDocumentBody,
} from "./dto/upload-document.dto";

const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

function buildCtx(user: TenantPrincipal, req: Request) {
  return {
    tenantId: user.tenantId,
    userId: user.userId,
    ip: getClientIp(req),
    userAgent: getUserAgent(req),
    ...(user.impersonatorId ? { impersonatorId: user.impersonatorId } : {}),
  };
}

@Controller("v1/suppliers")
@UseGuards(RateLimitGuard)
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  // ─── supplier CRUD ────────────────────────────────────────────────

  @Get()
  @RateLimit({ max: 60, windowMs: 60_000 })
  async list(
    @CurrentUser() user: TenantPrincipal,
    @Query(new ZodValidationPipe(ListSuppliersQuerySchema)) q: ListSuppliersQuery,
  ) {
    this.suppliers.assertCanRead(user.role);
    return this.suppliers.list(user.tenantId, q);
  }

  @Get(":id")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async getOne(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    this.suppliers.assertCanRead(user.role);
    return this.suppliers.getOne(user.tenantId, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  @Idempotent()
  @RateLimit({ max: 30, windowMs: 60_000 })
  async create(
    @CurrentUser() user: TenantPrincipal,
    @Body(new ZodValidationPipe(CreateSupplierSchema)) body: CreateSupplierBody,
    @Req() req: Request,
  ) {
    this.suppliers.assertCanWrite(user.role);
    return this.suppliers.create(user.tenantId, user.userId, body, buildCtx(user, req));
  }

  @Patch(":id")
  @RateLimit({ max: 30, windowMs: 60_000 })
  async update(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateSupplierSchema)) body: UpdateSupplierBody,
    @Req() req: Request,
  ) {
    this.suppliers.assertCanWrite(user.role);
    return this.suppliers.update(user.tenantId, id, body, buildCtx(user, req));
  }

  @Delete(":id")
  @RateLimit({ max: 30, windowMs: 60_000 })
  async remove(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    this.suppliers.assertCanWrite(user.role);
    assertNotImpersonating(user, "delete_supplier");
    return this.suppliers.softDelete(user.tenantId, id, buildCtx(user, req));
  }

  // ─── catalog ──────────────────────────────────────────────────────

  @Get(":id/catalog")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async listCatalog(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    this.suppliers.assertCanRead(user.role);
    return this.suppliers.listCatalog(user.tenantId, id);
  }

  @Post(":id/catalog")
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  @Idempotent()
  @RateLimit({ max: 30, windowMs: 60_000 })
  async addCatalog(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(CatalogCreateSchema)) body: CatalogCreateBody,
    @Req() req: Request,
  ) {
    this.suppliers.assertCanMutate(user.role);
    return this.suppliers.addCatalogEntry(
      user.tenantId,
      id,
      user.userId,
      body,
      buildCtx(user, req),
    );
  }

  @Patch(":id/catalog/:productId")
  @RateLimit({ max: 30, windowMs: 60_000 })
  async updateCatalog(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("productId", new ParseUUIDPipe()) productId: string,
    @Body(new ZodValidationPipe(CatalogUpdateSchema)) body: CatalogUpdateBody,
    @Req() req: Request,
  ) {
    this.suppliers.assertCanMutate(user.role);
    return this.suppliers.updateCatalogEntry(
      user.tenantId,
      id,
      productId,
      body,
      buildCtx(user, req),
    );
  }

  @Delete(":id/catalog/:productId")
  @RateLimit({ max: 30, windowMs: 60_000 })
  async removeCatalog(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("productId", new ParseUUIDPipe()) productId: string,
    @Req() req: Request,
  ) {
    this.suppliers.assertCanMutate(user.role);
    return this.suppliers.removeCatalogEntry(
      user.tenantId,
      id,
      productId,
      buildCtx(user, req),
    );
  }

  // ─── documents ────────────────────────────────────────────────────

  @Get(":id/documents")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async listDocuments(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    this.suppliers.assertCanRead(user.role);
    return this.suppliers.listDocuments(user.tenantId, id);
  }

  @Post(":id/documents")
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: MAX_DOCUMENT_BYTES } }),
    IdempotencyInterceptor,
  )
  @Idempotent()
  @RateLimit({ max: 30, windowMs: 60_000 })
  async uploadDocument(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body(new ZodValidationPipe(UploadSupplierDocumentSchema)) body: UploadSupplierDocumentBody,
    @Req() req: Request,
  ) {
    this.suppliers.assertCanMutate(user.role);
    if (!file) {
      throw new BadRequestException({
        code: "file_required",
        message: "Multipart field 'file' is required",
      });
    }
    return this.suppliers.uploadDocument(
      user.tenantId,
      id,
      user.userId,
      body,
      {
        buffer: file.buffer,
        declaredMime: file.mimetype,
        originalName: file.originalname,
      },
      buildCtx(user, req),
    );
  }

  @Get(":id/documents/:docId/download")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async downloadDocument(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("docId", new ParseUUIDPipe()) docId: string,
    @Res() res: Response,
  ) {
    this.suppliers.assertCanRead(user.role);
    const { buffer, mime, filename } = await this.suppliers.streamDocument(
      user.tenantId,
      id,
      docId,
    );
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.setHeader("Cache-Control", "private, max-age=300");
    res.send(buffer);
  }

  @Delete(":id/documents/:docId")
  @RateLimit({ max: 30, windowMs: 60_000 })
  async deleteDocument(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("docId", new ParseUUIDPipe()) docId: string,
    @Req() req: Request,
  ) {
    this.suppliers.assertCanMutate(user.role);
    return this.suppliers.deleteDocument(user.tenantId, id, docId, buildCtx(user, req));
  }
}
