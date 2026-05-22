/// <reference types="multer" />
import {
  BadRequestException,
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
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request, Response } from "express";
import { Public } from "../auth/public.decorator";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { RateLimit, RateLimitGuard } from "../../common/rate-limit.guard";
import { Idempotent, IdempotencyInterceptor } from "../../common/idempotency.interceptor";
import { getClientIp, getUserAgent } from "../../common/request-context";
import { CurrentUser, type TenantPrincipal } from "../auth/current-user.decorator";
import { assertNotImpersonating } from "../auth/impersonation.helper";
import { CatalogService } from "./catalog.service";
import { CsvImportService } from "./csv-import.service";
import { ListProductsQuerySchema, type ListProductsQuery } from "./dto/list-products.dto";
import { CreateProductSchema, type CreateProductBody } from "./dto/create-product.dto";
import { UpdateProductSchema, type UpdateProductBody } from "./dto/update-product.dto";
import { CreateCategorySchema, type CreateCategoryBody } from "./dto/create-category.dto";
import { UpdateCategorySchema, type UpdateCategoryBody } from "./dto/update-category.dto";

const MUTATOR_ROLES = new Set(["owner", "manager"]);

function assertMutator(user: TenantPrincipal): void {
  if (!MUTATOR_ROLES.has(user.role)) {
    throw new ForbiddenException({
      code: "forbidden_role",
      message: "Only owners and managers can modify the catalog",
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

@Controller("v1")
@UseGuards(RateLimitGuard)
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly csvImport: CsvImportService,
  ) {}

  @Get("categories")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async listCategories(@CurrentUser() user: TenantPrincipal) {
    return this.catalog.listCategories(user.tenantId);
  }

  @Post("categories")
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  @Idempotent()
  @RateLimit({ max: 30, windowMs: 60_000 })
  async createCategory(
    @CurrentUser() user: TenantPrincipal,
    @Body(new ZodValidationPipe(CreateCategorySchema)) body: CreateCategoryBody,
    @Req() req: Request,
  ) {
    assertMutator(user);
    return this.catalog.createCategory(user.tenantId, user.userId, body, buildCtx(user, req));
  }

  @Patch("categories/:id")
  @RateLimit({ max: 30, windowMs: 60_000 })
  async updateCategory(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateCategorySchema)) body: UpdateCategoryBody,
    @Req() req: Request,
  ) {
    assertMutator(user);
    return this.catalog.updateCategory(user.tenantId, id, body, buildCtx(user, req));
  }

  @Delete("categories/:id")
  @RateLimit({ max: 30, windowMs: 60_000 })
  async deleteCategory(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    assertMutator(user);
    assertNotImpersonating(user, "delete_category");
    return this.catalog.softDeleteCategory(user.tenantId, id, buildCtx(user, req));
  }

  @Get("products")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async listProducts(
    @CurrentUser() user: TenantPrincipal,
    @Query(new ZodValidationPipe(ListProductsQuerySchema)) q: ListProductsQuery,
  ) {
    return this.catalog.listProducts(user.tenantId, q);
  }

  @Get("products/:id")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async getProduct(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.catalog.getProduct(user.tenantId, id);
  }

  @Get("products/:id/detail")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async getProductDetail(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.catalog.getProductDetail(user.tenantId, id);
  }

  @Get("products/:id/movements")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async getProductMovements(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Query("page") pageRaw?: string,
    @Query("limit") limitRaw?: string,
  ) {
    const page = Math.max(1, parseInt(pageRaw ?? "1", 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(limitRaw ?? "50", 10) || 50));
    return this.catalog.getProductMovements(user.tenantId, id, { page, limit });
  }

  @Get("products/:id/activity")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async getProductActivity(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Query("page") pageRaw?: string,
    @Query("limit") limitRaw?: string,
  ) {
    const page = Math.max(1, parseInt(pageRaw ?? "1", 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(limitRaw ?? "50", 10) || 50));
    return this.catalog.getProductActivity(user.tenantId, id, { page, limit });
  }

  @Post("products")
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  @Idempotent()
  @RateLimit({ max: 30, windowMs: 60_000 })
  async createProduct(
    @CurrentUser() user: TenantPrincipal,
    @Body(new ZodValidationPipe(CreateProductSchema)) body: CreateProductBody,
    @Req() req: Request,
  ) {
    assertMutator(user);
    return this.catalog.createProduct(user.tenantId, user.userId, body, buildCtx(user, req));
  }

  @Patch("products/:id")
  @RateLimit({ max: 30, windowMs: 60_000 })
  async updateProduct(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateProductSchema)) body: UpdateProductBody,
    @Req() req: Request,
  ) {
    assertMutator(user);
    return this.catalog.updateProduct(user.tenantId, id, body, buildCtx(user, req));
  }

  @Delete("products/:id")
  @RateLimit({ max: 30, windowMs: 60_000 })
  async deleteProduct(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    assertMutator(user);
    assertNotImpersonating(user, "delete_product");
    return this.catalog.softDeleteProduct(user.tenantId, id, buildCtx(user, req));
  }

  // ─── product image (1.8e) ────────────────────────────────────────
  // Upload, clear, and stream product images.

  @Post("products/:id/image")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor("image", { limits: { fileSize: 5 * 1024 * 1024 } }),
    IdempotencyInterceptor,
  )
  @Idempotent()
  @RateLimit({ max: 20, windowMs: 60_000 })
  async uploadProductImage(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
  ) {
    assertMutator(user);
    if (!file) {
      throw new BadRequestException({
        code: "image_required",
        message: "Multipart field 'image' is required",
      });
    }
    return this.catalog.setProductImage(
      user.tenantId,
      id,
      user.userId,
      { buffer: file.buffer, declaredMime: file.mimetype, originalName: file.originalname },
      buildCtx(user, req),
    );
  }

  @Delete("products/:id/image")
  @RateLimit({ max: 30, windowMs: 60_000 })
  async clearProductImage(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    assertMutator(user);
    return this.catalog.clearProductImage(user.tenantId, id, buildCtx(user, req));
  }

  @Get("products/:id/image")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async streamProductImage(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Res() res: Response,
  ) {
    const { buffer, mime, filename } = await this.catalog.streamProductImage(user.tenantId, id);
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.setHeader("Cache-Control", "private, max-age=300");
    res.send(buffer);
  }

  /**
   * Public read endpoint for product images. Required for raw `<img src>` tags
   * which can't carry a Bearer header. Path includes a tenant_id segment so the
   * image is keyed by tenant + product; rate-limited 120/min per IP. Catalog
   * images are not PII / not financial; this is an intentional security
   * tradeoff vs the bearer-authed streaming endpoint above. Signed URLs land in
   * a later hardening slice.
   */
  @Post("products/import")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 2 * 1024 * 1024 } }))
  @RateLimit({ max: 5, windowMs: 60_000 })
  async importProducts(
    @CurrentUser() user: TenantPrincipal,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query("dry_run") dryRun: string | undefined,
    @Req() req: Request,
  ) {
    assertMutator(user);
    if (!file) {
      throw new BadRequestException({
        code: "file_required",
        message: "Multipart field 'file' is required",
      });
    }
    return this.csvImport.importProducts(
      user.tenantId,
      user.userId,
      { buffer: file.buffer, originalName: file.originalname },
      { dryRun: dryRun === "1" || dryRun === "true" },
      buildCtx(user, req),
    );
  }

  @Public()
  @Get("public/tenants/:tenantId/products/:id/image")
  @RateLimit({ max: 120, windowMs: 60_000 })
  async publicProductImage(
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Res() res: Response,
  ) {
    const { buffer, mime, filename } = await this.catalog.streamProductImage(tenantId, id);
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.setHeader("Cache-Control", "public, max-age=600, immutable");
    res.send(buffer);
  }
}
