import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { fromBuffer as fileTypeFromBuffer } from "file-type";
// Tenant-tax lookup reads the platform-scoped `tenants` table (no tenant_id,
// not under RLS) — mirrors branches.service's adminPrisma usage for the same
// purpose.
// eslint-disable-next-line no-restricted-imports
import { adminPrisma, tenantScoped } from "@madar/db";
import { AuditService, type AuditCtx } from "../auth/audit.service";
import { ImageProcessor, type SupportedMime } from "../../common/image/image-processor.service";
import { STORAGE_SERVICE, type StorageService } from "../../common/storage/storage.service";
import { VIRUS_SCAN_SERVICE, type VirusScanService } from "../../common/virus-scan/virus-scan.service";
import type { ListProductsQuery } from "./dto/list-products.dto";
import type { CreateProductBody } from "./dto/create-product.dto";
import type { UpdateProductBody } from "./dto/update-product.dto";
import type { CreateCategoryBody } from "./dto/create-category.dto";
import type { UpdateCategoryBody } from "./dto/update-category.dto";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIMES: SupportedMime[] = ["image/jpeg", "image/png", "image/webp"];

interface ApiProduct {
  id: string;
  sku: string;
  name_i18n: { en: string; ar: string };
  description_i18n: { en?: string; ar?: string } | null;
  category_id: string | null;
  category_code: string | null;
  tax_class_id: string | null;
  /** Effective tax rate as a percentage, e.g. 14.0 for 14%. Resolves to the
   *  product's own `tax_class_id` first, else the tenant's default tax class,
   *  else `null` when neither is set. */
  tax_rate_pct: number | null;
  price_cents: bigint;
  cost_cents: bigint;
  currency_code: string;
  barcode: string | null;
  is_active: boolean;
  image_url: string | null;
  qty_on_hand: number;
  reorder_point: number | null;
  velocity_per_week: number;
}

interface PerBranchStock {
  branch_id: string;
  branch_code: string;
  branch_name_i18n: { en: string; ar: string };
  qty_on_hand: number;
  reorder_point: number | null;
  reorder_qty: number | null;
  available: number;
  last_movement_at: string | null;
}

interface ProductKpis {
  total_stock_value_cents: string;
  units_sold_30d: number;
  velocity_per_day: number;
  days_of_cover: number | null;
}

interface ApiProductDetail extends ApiProduct {
  per_branch_stock: PerBranchStock[];
  kpis: ProductKpis;
}

interface ApiMovementItem {
  id: string;
  branch_id: string;
  branch_code: string;
  kind: string;
  qty_delta: number;
  unit_cost_cents: string | null;
  reference_table: string | null;
  reference_id: string | null;
  note: string | null;
  occurred_at: string;
}

interface ApiActivityItem {
  id: string;
  user_id: string | null;
  user_name: string | null;
  impersonator_id: string | null;
  action: string;
  before: unknown;
  after: unknown;
  created_at: string;
}

interface ApiCategory {
  id: string;
  code: string;
  name_i18n: { en: string; ar: string };
  sort_order: number;
  parent_id: string | null;
  product_count: number;
}

interface StockAggregateRow {
  product_id: string;
  qty: bigint | number;
  reorder: number | null;
}

@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  constructor(
    private readonly audit: AuditService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    @Inject(VIRUS_SCAN_SERVICE) private readonly scanner: VirusScanService,
    private readonly imageProcessor: ImageProcessor,
  ) {}

  async listCategories(tenantId: string): Promise<{ items: ApiCategory[]; total: number }> {
    const client = tenantScoped(tenantId) as unknown as {
      category: { findMany: (args: unknown) => Promise<RawCategory[]> };
      product: { groupBy: (args: unknown) => Promise<Array<{ category_id: string | null; _count: { _all: number } }>> };
    };

    const [rows, counts] = await Promise.all([
      client.category.findMany({
        where: { deleted_at: null },
        orderBy: { sort_order: "asc" },
      }),
      client.product.groupBy({
        by: ["category_id"],
        where: { deleted_at: null, is_active: true },
        _count: { _all: true },
      }),
    ]);

    const countByCat = new Map<string | null, number>();
    for (const c of counts) countByCat.set(c.category_id, c._count._all);

    const items: ApiCategory[] = rows.map((r) => ({
      id: r.id,
      code: r.code,
      name_i18n: r.name_i18n as { en: string; ar: string },
      sort_order: r.sort_order,
      parent_id: r.parent_id,
      product_count: countByCat.get(r.id) ?? 0,
    }));

    return { items, total: items.length };
  }

  async listProducts(
    tenantId: string,
    q: ListProductsQuery,
  ): Promise<{ items: ApiProduct[]; total: number; limit: number }> {
    const client = tenantScoped(tenantId) as unknown as {
      product: { findMany: (args: unknown) => Promise<RawProduct[]> };
      category: { findMany: (args: unknown) => Promise<Array<{ id: string; code: string }>> };
      $queryRawUnsafe: <T = unknown>(q: string, ...params: unknown[]) => Promise<T>;
    };

    const where: Record<string, unknown> = {
      deleted_at: null,
      is_active: true,
    };
    if (q.category_id) where.category_id = q.category_id;

    // Search expansion: SKU + name_i18n->>'en' + name_i18n->>'ar'. Prisma's
    // JSON `string_contains` is case-sensitive, so we prefilter to matching
    // IDs with a raw ILIKE query, then let findMany pull the typed rows.
    if (q.search) {
      const pattern = `%${q.search.replace(/[\\%_]/g, "\\$&")}%`;
      const matched = await client.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM products
         WHERE deleted_at IS NULL
           AND is_active = TRUE
           AND (
             sku ILIKE $1
             OR name_i18n->>'en' ILIKE $1
             OR name_i18n->>'ar' ILIKE $1
           )
         LIMIT $2`,
        pattern,
        q.limit,
      );
      if (matched.length === 0) {
        return { items: [], total: 0, limit: q.limit };
      }
      where.id = { in: matched.map((r) => r.id) };
    }

    const products = await client.product.findMany({
      where,
      orderBy: [{ sku: "asc" }],
      take: q.limit,
    });

    if (products.length === 0) {
      return { items: [], total: 0, limit: q.limit };
    }

    const categoryIds = Array.from(
      new Set(products.map((p) => p.category_id).filter((id): id is string => id !== null)),
    );
    const categories =
      categoryIds.length === 0
        ? []
        : await client.category.findMany({
            where: { id: { in: categoryIds } },
            select: { id: true, code: true },
          });
    const codeById = new Map<string, string>();
    for (const c of categories) codeById.set(c.id, c.code);

    const productIds = products.map((p) => p.id);
    // When q.branch_id is set, scope stock aggregation to a single branch (no SUM, no MIN);
    // otherwise return chain-wide aggregates for the topbar's "All branches" selection.
    const branchScoped = Boolean(q.branch_id);
    const stockSql = branchScoped
      ? `SELECT product_id,
                COALESCE(qty_on_hand, 0)::bigint AS qty,
                reorder_point AS reorder
         FROM branch_stock
         WHERE product_id = ANY($1::uuid[])
           AND branch_id = $2::uuid
           AND deleted_at IS NULL`
      : `SELECT product_id,
                COALESCE(SUM(qty_on_hand), 0)::bigint AS qty,
                MIN(reorder_point) FILTER (WHERE reorder_point IS NOT NULL) AS reorder
         FROM branch_stock
         WHERE product_id = ANY($1::uuid[])
         GROUP BY product_id`;
    const stockParams: unknown[] = branchScoped ? [productIds, q.branch_id] : [productIds];
    const [stockRows, velocityRows] = await Promise.all([
      client.$queryRawUnsafe<StockAggregateRow[]>(stockSql, ...stockParams),
      // 1.8d: sales velocity over the last 7 days. qty_delta is negative for
      // sale movements (see apps/api/src/tenant/sales/sales.service.ts), so we
      // ABS it to get units sold.
      client.$queryRawUnsafe<VelocityRow[]>(
        `SELECT product_id,
                COALESCE(SUM(ABS(qty_delta)), 0)::bigint AS qty
         FROM stock_movements
         WHERE kind = 'sale'
           AND occurred_at > now() - INTERVAL '7 days'
           AND product_id = ANY($1::uuid[])
         GROUP BY product_id`,
        productIds,
      ),
    ]);

    const stockByProduct = new Map<string, { qty: number; reorder: number | null }>();
    for (const row of stockRows) {
      stockByProduct.set(row.product_id, {
        qty: typeof row.qty === "bigint" ? Number(row.qty) : Number(row.qty ?? 0),
        reorder: row.reorder === null || row.reorder === undefined ? null : Number(row.reorder),
      });
    }

    const velocityByProduct = new Map<string, number>();
    for (const row of velocityRows) {
      velocityByProduct.set(
        row.product_id,
        typeof row.qty === "bigint" ? Number(row.qty) : Number(row.qty ?? 0),
      );
    }

    const taxRatesByProduct = await this.resolveTaxRates(
      tenantId,
      products.map((p) => ({ id: p.id, tax_class_id: p.tax_class_id })),
    );

    let items: ApiProduct[] = products.map((p) => {
      const stock = stockByProduct.get(p.id);
      return {
        id: p.id,
        sku: p.sku,
        name_i18n: p.name_i18n as { en: string; ar: string },
        description_i18n: (p.description_i18n as { en?: string; ar?: string } | null) ?? null,
        category_id: p.category_id,
        category_code: p.category_id ? codeById.get(p.category_id) ?? null : null,
        tax_class_id: p.tax_class_id,
        tax_rate_pct: taxRatesByProduct.get(p.id) ?? null,
        price_cents: p.price_cents,
        cost_cents: p.cost_cents,
        currency_code: p.currency_code,
        barcode: p.barcode,
        is_active: p.is_active,
        image_url: p.image_url ?? null,
        qty_on_hand: stock?.qty ?? 0,
        reorder_point: stock?.reorder ?? null,
        velocity_per_week: velocityByProduct.get(p.id) ?? 0,
      };
    });

    if (q.only_low_stock) {
      items = items.filter(
        (p) => p.reorder_point !== null && p.qty_on_hand < p.reorder_point,
      );
    }

    return { items, total: items.length, limit: q.limit };
  }

  async getProduct(tenantId: string, productId: string): Promise<ApiProduct> {
    const client = tenantScoped(tenantId) as unknown as {
      product: { findUnique: (args: unknown) => Promise<RawProduct | null> };
      category: { findUnique: (args: unknown) => Promise<{ id: string; code: string } | null> };
      $queryRawUnsafe: <T = unknown>(q: string, ...params: unknown[]) => Promise<T>;
    };
    const p = await client.product.findUnique({ where: { id: productId } });
    if (!p || (p as RawProduct & { deleted_at?: Date | null }).deleted_at) {
      throw new NotFoundException({ code: "product_not_found", message: "Product not found" });
    }
    let categoryCode: string | null = null;
    if (p.category_id) {
      const cat = await client.category.findUnique({ where: { id: p.category_id } });
      categoryCode = cat?.code ?? null;
    }
    const [stockRows, velocityRows] = await Promise.all([
      client.$queryRawUnsafe<StockAggregateRow[]>(
        `SELECT product_id,
                COALESCE(SUM(qty_on_hand), 0)::bigint AS qty,
                MIN(reorder_point) FILTER (WHERE reorder_point IS NOT NULL) AS reorder
         FROM branch_stock
         WHERE product_id = $1::uuid
         GROUP BY product_id`,
        productId,
      ),
      client.$queryRawUnsafe<VelocityRow[]>(
        `SELECT product_id,
                COALESCE(SUM(ABS(qty_delta)), 0)::bigint AS qty
         FROM stock_movements
         WHERE kind = 'sale'
           AND occurred_at > now() - INTERVAL '7 days'
           AND product_id = $1::uuid
         GROUP BY product_id`,
        productId,
      ),
    ]);
    const stock = stockRows[0];
    const velocity = velocityRows[0]?.qty != null
      ? (typeof velocityRows[0].qty === "bigint" ? Number(velocityRows[0].qty) : Number(velocityRows[0].qty))
      : 0;
    const rates = await this.resolveTaxRates(tenantId, [
      { id: p.id, tax_class_id: p.tax_class_id },
    ]);
    return {
      id: p.id,
      sku: p.sku,
      name_i18n: p.name_i18n as { en: string; ar: string },
      description_i18n: (p.description_i18n as { en?: string; ar?: string } | null) ?? null,
      category_id: p.category_id,
      category_code: categoryCode,
      tax_class_id: p.tax_class_id,
      tax_rate_pct: rates.get(p.id) ?? null,
      price_cents: p.price_cents,
      cost_cents: p.cost_cents,
      currency_code: p.currency_code,
      barcode: p.barcode,
      is_active: p.is_active,
      image_url: p.image_url ?? null,
      qty_on_hand: stock ? (typeof stock.qty === "bigint" ? Number(stock.qty) : Number(stock.qty)) : 0,
      reorder_point: stock?.reorder == null ? null : Number(stock.reorder),
      velocity_per_week: velocity,
    };
  }

  /**
   * Resolve the effective tax-rate (as a percentage) per product. Each product
   * uses its own `tax_class_id` if set, otherwise falls back to the tenant's
   * `default_tax_class_id`. Returns a Map keyed by product id; rate is null
   * when neither lookup yields an active tax class.
   *
   * Single round-trip for the tenant default + a batched `findMany` for the
   * union of distinct class ids in this product set.
   */
  private async resolveTaxRates(
    tenantId: string,
    products: Array<{ id: string; tax_class_id: string | null }>,
  ): Promise<Map<string, number | null>> {
    const result = new Map<string, number | null>();
    if (products.length === 0) return result;

    const tenant = await adminPrisma.tenant.findUnique({
      where: { id: tenantId },
      select: { default_tax_class_id: true },
    });
    const defaultClassId = tenant?.default_tax_class_id ?? null;

    const wantedIds = new Set<string>();
    for (const p of products) {
      if (p.tax_class_id) wantedIds.add(p.tax_class_id);
    }
    if (defaultClassId) wantedIds.add(defaultClassId);

    let rateById = new Map<string, number>();
    if (wantedIds.size > 0) {
      const scoped = tenantScoped(tenantId);
      const classes = await scoped.taxClass.findMany({
        where: { id: { in: Array.from(wantedIds) }, deleted_at: null, is_active: true },
        select: { id: true, rate_bps: true },
      });
      rateById = new Map(
        classes.map((c) => [c.id, Number(c.rate_bps) / 100]),
      );
    }

    for (const p of products) {
      const effectiveId = p.tax_class_id ?? defaultClassId;
      const rate = effectiveId ? rateById.get(effectiveId) ?? null : null;
      result.set(p.id, rate);
    }
    return result;
  }

  // ──────────────────────────────────────────────────────────────────
  // Mutations
  // ──────────────────────────────────────────────────────────────────

  async createProduct(
    tenantId: string,
    actorId: string,
    body: CreateProductBody,
    ctx: AuditCtx,
  ): Promise<ApiProduct> {
    const scoped = tenantScoped(tenantId);

    if (body.category_id) {
      const cat = await scoped.category.findUnique({ where: { id: body.category_id } });
      if (!cat || cat.deleted_at) {
        throw new UnprocessableEntityException({
          code: "unknown_category",
          message: "Category not found",
        });
      }
    }

    if (body.initial_stock && body.initial_stock.length > 0) {
      const branchIds = body.initial_stock.map((e) => e.branch_id);
      const branches = await scoped.branch.findMany({
        where: { id: { in: branchIds }, deleted_at: null },
        select: { id: true },
      });
      const known = new Set(branches.map((b) => b.id));
      for (const id of branchIds) {
        if (!known.has(id)) {
          throw new UnprocessableEntityException({
            code: "unknown_branch",
            message: `Branch not found: ${id}`,
          });
        }
      }
    }

    let createdId: string;
    try {
      createdId = await scoped.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            tenant_id: tenantId,
            sku: body.sku,
            name_i18n: body.name_i18n,
            description_i18n: body.description_i18n,
            category_id: body.category_id ?? null,
            tax_class_id: body.tax_class_id ?? null,
            price_cents: BigInt(body.price_cents),
            cost_cents: BigInt(body.cost_cents),
            currency_code: body.currency_code,
            barcode: body.barcode ?? null,
            is_active: body.is_active ?? true,
            created_by: actorId,
          },
        });

        if (body.initial_stock) {
          for (const entry of body.initial_stock) {
            if (entry.qty > 0) {
              await tx.stockMovement.create({
                data: {
                  tenant_id: tenantId,
                  branch_id: entry.branch_id,
                  product_id: product.id,
                  kind: "adjustment",
                  qty_delta: entry.qty,
                  note: "initial_stock",
                  created_by: actorId,
                },
              });
            }
            await tx.branchStock.upsert({
              where: {
                tenant_id_branch_id_product_id: {
                  tenant_id: tenantId,
                  branch_id: entry.branch_id,
                  product_id: product.id,
                },
              },
              update: {
                qty_on_hand: entry.qty,
                reorder_point: entry.reorder_point ?? null,
                reorder_qty: entry.reorder_qty ?? null,
                last_movement_at: entry.qty > 0 ? new Date() : undefined,
              },
              create: {
                tenant_id: tenantId,
                branch_id: entry.branch_id,
                product_id: product.id,
                qty_on_hand: entry.qty,
                reorder_point: entry.reorder_point ?? null,
                reorder_qty: entry.reorder_qty ?? null,
                last_movement_at: entry.qty > 0 ? new Date() : null,
                created_by: actorId,
              },
            });
          }
        }

        return product.id;
      });
    } catch (err) {
      if ((err as { code?: string } | undefined)?.code === "P2002") {
        throw new ConflictException({
          code: "sku_taken",
          message: "A product with this SKU already exists",
          fields: { sku: "sku_taken" },
        });
      }
      throw err;
    }

    await this.audit
      .writeTenantScoped(ctx, {
        action: "product_created",
        entity: "product",
        entityId: createdId,
        after: {
          sku: body.sku,
          name_en: body.name_i18n.en,
          price_cents: body.price_cents.toString(),
          cost_cents: body.cost_cents.toString(),
          currency_code: body.currency_code,
          category_id: body.category_id ?? null,
        },
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return this.getProduct(tenantId, createdId);
  }

  async updateProduct(
    tenantId: string,
    productId: string,
    body: UpdateProductBody,
    ctx: AuditCtx,
  ): Promise<ApiProduct> {
    const scoped = tenantScoped(tenantId);

    const existing = await scoped.product.findUnique({ where: { id: productId } });
    if (!existing || existing.deleted_at) {
      throw new NotFoundException({ code: "product_not_found", message: "Product not found" });
    }

    if (body.category_id) {
      const cat = await scoped.category.findUnique({ where: { id: body.category_id } });
      if (!cat || cat.deleted_at) {
        throw new UnprocessableEntityException({
          code: "unknown_category",
          message: "Category not found",
        });
      }
    }

    const data: Record<string, unknown> = {};
    if (body.sku !== undefined) data.sku = body.sku;
    if (body.name_i18n !== undefined) data.name_i18n = body.name_i18n;
    if (body.description_i18n !== undefined) data.description_i18n = body.description_i18n;
    if (body.category_id !== undefined) data.category_id = body.category_id;
    if (body.tax_class_id !== undefined) data.tax_class_id = body.tax_class_id;
    if (body.price_cents !== undefined) data.price_cents = BigInt(body.price_cents);
    if (body.cost_cents !== undefined) data.cost_cents = BigInt(body.cost_cents);
    if (body.currency_code !== undefined) data.currency_code = body.currency_code;
    if (body.barcode !== undefined) data.barcode = body.barcode;
    if (body.is_active !== undefined) data.is_active = body.is_active;

    try {
      await scoped.product.update({ where: { id: productId }, data });
    } catch (err) {
      if ((err as { code?: string } | undefined)?.code === "P2002") {
        throw new ConflictException({
          code: "sku_taken",
          message: "A product with this SKU already exists",
          fields: { sku: "sku_taken" },
        });
      }
      throw err;
    }

    await this.audit
      .writeTenantScoped(ctx, {
        action: "product_updated",
        entity: "product",
        entityId: productId,
        before: {
          sku: existing.sku,
          price_cents: existing.price_cents.toString(),
          cost_cents: existing.cost_cents.toString(),
          is_active: existing.is_active,
          category_id: existing.category_id,
        },
        after: serializeChanges(body),
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return this.getProduct(tenantId, productId);
  }

  async softDeleteProduct(
    tenantId: string,
    productId: string,
    ctx: AuditCtx,
  ): Promise<{ id: string; deleted_at: string }> {
    const scoped = tenantScoped(tenantId);
    const existing = await scoped.product.findUnique({ where: { id: productId } });
    if (!existing) {
      throw new NotFoundException({ code: "product_not_found", message: "Product not found" });
    }
    if (existing.deleted_at) {
      return { id: existing.id, deleted_at: existing.deleted_at.toISOString() };
    }
    const now = new Date();
    await scoped.product.update({
      where: { id: productId },
      data: { deleted_at: now, is_active: false },
    });

    await this.audit
      .writeTenantScoped(ctx, {
        action: "product_deleted",
        entity: "product",
        entityId: productId,
        before: { sku: existing.sku, is_active: existing.is_active },
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return { id: productId, deleted_at: now.toISOString() };
  }

  async createCategory(
    tenantId: string,
    actorId: string,
    body: CreateCategoryBody,
    ctx: AuditCtx,
  ): Promise<ApiCategory> {
    const scoped = tenantScoped(tenantId);

    if (body.parent_id) {
      const parent = await scoped.category.findUnique({ where: { id: body.parent_id } });
      if (!parent || parent.deleted_at) {
        throw new UnprocessableEntityException({
          code: "unknown_parent_category",
          message: "Parent category not found",
        });
      }
    }

    let created;
    try {
      created = await scoped.category.create({
        data: {
          tenant_id: tenantId,
          code: body.code,
          name_i18n: body.name_i18n,
          sort_order: body.sort_order ?? 0,
          parent_id: body.parent_id ?? null,
          created_by: actorId,
        },
      });
    } catch (err) {
      if ((err as { code?: string } | undefined)?.code === "P2002") {
        throw new ConflictException({
          code: "category_code_taken",
          message: "A category with this code already exists",
          fields: { code: "category_code_taken" },
        });
      }
      throw err;
    }

    await this.audit
      .writeTenantScoped(ctx, {
        action: "category_created",
        entity: "category",
        entityId: created.id,
        after: { code: body.code, name_en: body.name_i18n.en, sort_order: body.sort_order ?? 0 },
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return {
      id: created.id,
      code: created.code,
      name_i18n: created.name_i18n as { en: string; ar: string },
      sort_order: created.sort_order,
      parent_id: created.parent_id,
      product_count: 0,
    };
  }

  async updateCategory(
    tenantId: string,
    categoryId: string,
    body: UpdateCategoryBody,
    ctx: AuditCtx,
  ): Promise<ApiCategory> {
    const scoped = tenantScoped(tenantId);
    const existing = await scoped.category.findUnique({ where: { id: categoryId } });
    if (!existing || existing.deleted_at) {
      throw new NotFoundException({ code: "category_not_found", message: "Category not found" });
    }

    if (body.parent_id !== undefined && body.parent_id !== null) {
      if (body.parent_id === categoryId) {
        throw new BadRequestException({
          code: "category_self_parent",
          message: "A category cannot be its own parent",
        });
      }
      const parent = await scoped.category.findUnique({ where: { id: body.parent_id } });
      if (!parent || parent.deleted_at) {
        throw new UnprocessableEntityException({
          code: "unknown_parent_category",
          message: "Parent category not found",
        });
      }
    }

    const data: Record<string, unknown> = {};
    if (body.code !== undefined) data.code = body.code;
    if (body.name_i18n !== undefined) data.name_i18n = body.name_i18n;
    if (body.sort_order !== undefined) data.sort_order = body.sort_order;
    if (body.parent_id !== undefined) data.parent_id = body.parent_id;

    let updated;
    try {
      updated = await scoped.category.update({ where: { id: categoryId }, data });
    } catch (err) {
      if ((err as { code?: string } | undefined)?.code === "P2002") {
        throw new ConflictException({
          code: "category_code_taken",
          message: "A category with this code already exists",
          fields: { code: "category_code_taken" },
        });
      }
      throw err;
    }

    const productCount = await scoped.product.count({
      where: { category_id: categoryId, deleted_at: null },
    });

    await this.audit
      .writeTenantScoped(ctx, {
        action: "category_updated",
        entity: "category",
        entityId: categoryId,
        before: { code: existing.code, sort_order: existing.sort_order, parent_id: existing.parent_id },
        after: serializeChanges(body),
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return {
      id: updated.id,
      code: updated.code,
      name_i18n: updated.name_i18n as { en: string; ar: string },
      sort_order: updated.sort_order,
      parent_id: updated.parent_id,
      product_count: productCount,
    };
  }

  async softDeleteCategory(
    tenantId: string,
    categoryId: string,
    ctx: AuditCtx,
  ): Promise<{ id: string; deleted_at: string }> {
    const scoped = tenantScoped(tenantId);
    const existing = await scoped.category.findUnique({ where: { id: categoryId } });
    if (!existing) {
      throw new NotFoundException({ code: "category_not_found", message: "Category not found" });
    }
    if (existing.deleted_at) {
      return { id: existing.id, deleted_at: existing.deleted_at.toISOString() };
    }

    const inUse = await scoped.product.count({
      where: { category_id: categoryId, deleted_at: null },
    });
    if (inUse > 0) {
      throw new BadRequestException({
        code: "category_in_use",
        message: `Cannot delete category: ${inUse} product(s) still reference it`,
        fields: { product_count: inUse.toString() },
      });
    }

    const now = new Date();
    await scoped.category.update({
      where: { id: categoryId },
      data: { deleted_at: now },
    });

    await this.audit
      .writeTenantScoped(ctx, {
        action: "category_deleted",
        entity: "category",
        entityId: categoryId,
        before: { code: existing.code, name_en: (existing.name_i18n as { en?: string })?.en ?? null },
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return { id: categoryId, deleted_at: now.toISOString() };
  }

  // ──────────────────────────────────────────────────────────────────
  // Product images (1.8e). Reuses the 1.11d image pipeline:
  //   file-type magic bytes → virus scan → sharp resize+EXIF strip → storage.
  // Path convention: tenants/{tid}/products/{pid}.{ext}
  // ──────────────────────────────────────────────────────────────────

  async setProductImage(
    tenantId: string,
    productId: string,
    actorId: string,
    file: { buffer: Buffer; declaredMime: string; originalName: string },
    ctx: AuditCtx,
  ): Promise<ApiProduct> {
    if (file.buffer.length > MAX_IMAGE_BYTES) {
      throw new BadRequestException({
        code: "file_too_large",
        message: "Image must be 5MB or smaller",
      });
    }

    const detected = await fileTypeFromBuffer(file.buffer);
    const detectedMime = detected?.mime ?? "";
    if (!ALLOWED_IMAGE_MIMES.includes(detectedMime as SupportedMime)) {
      throw new BadRequestException({
        code: "file_mime_unsupported",
        message: "Image must be JPG, PNG, or WEBP",
      });
    }
    const mime = detectedMime as SupportedMime;

    const scoped = tenantScoped(tenantId);
    const existing = await scoped.product.findUnique({ where: { id: productId } });
    if (!existing || existing.deleted_at) {
      throw new NotFoundException({ code: "product_not_found", message: "Product not found" });
    }

    const scanResult = await this.scanner.scan(file.buffer);
    if (!scanResult.clean) {
      throw new UnprocessableEntityException({
        code: "file_infected",
        message: "Image failed virus scan",
      });
    }

    const processed = await this.imageProcessor.process(file.buffer, mime);
    const relPath = `tenants/${tenantId}/products/${productId}.${processed.ext}`;
    await this.storage.put(relPath, processed.buffer);

    // If the previous image had a different extension, drop those bytes —
    // we overwrite by deterministic path, so a re-upload at the same ext is
    // already idempotent. Different ext only happens when MIME changes.
    if (existing.image_url && existing.image_url !== relPath) {
      void this.storage
        .delete(existing.image_url)
        .catch((e) => this.logger.warn(`stale image delete failed: ${(e as Error).message}`));
    }

    await scoped.product.update({
      where: { id: productId },
      data: { image_url: relPath, created_by: existing.created_by ?? actorId },
    });

    await this.audit
      .writeTenantScoped(ctx, {
        action: "product_image_set",
        entity: "product",
        entityId: productId,
        before: { image_url: existing.image_url ?? null },
        after: { image_url: relPath, mime: processed.mime },
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return this.getProduct(tenantId, productId);
  }

  async clearProductImage(
    tenantId: string,
    productId: string,
    ctx: AuditCtx,
  ): Promise<ApiProduct> {
    const scoped = tenantScoped(tenantId);
    const existing = await scoped.product.findUnique({ where: { id: productId } });
    if (!existing || existing.deleted_at) {
      throw new NotFoundException({ code: "product_not_found", message: "Product not found" });
    }
    if (!existing.image_url) {
      return this.getProduct(tenantId, productId);
    }

    const oldPath = existing.image_url;
    await scoped.product.update({
      where: { id: productId },
      data: { image_url: null },
    });

    void this.storage
      .delete(oldPath)
      .catch((e) => this.logger.warn(`image delete failed: ${(e as Error).message}`));

    await this.audit
      .writeTenantScoped(ctx, {
        action: "product_image_cleared",
        entity: "product",
        entityId: productId,
        before: { image_url: oldPath },
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return this.getProduct(tenantId, productId);
  }

  // ──────────────────────────────────────────────────────────────────
  // Product detail (1.8c): extended shape + movements + activity feeds.
  // ──────────────────────────────────────────────────────────────────

  async getProductDetail(tenantId: string, productId: string): Promise<ApiProductDetail> {
    const base = await this.getProduct(tenantId, productId);

    const client = tenantScoped(tenantId) as unknown as {
      $queryRawUnsafe: <T = unknown>(q: string, ...params: unknown[]) => Promise<T>;
    };

    const [branchRows, unitsSold30dRows] = await Promise.all([
      client.$queryRawUnsafe<PerBranchStockRow[]>(
        `SELECT bs.branch_id, bs.qty_on_hand, bs.reorder_point, bs.reorder_qty, bs.last_movement_at,
                b.code AS branch_code, b.name_i18n AS branch_name_i18n
         FROM branch_stock bs
         INNER JOIN branches b ON b.id = bs.branch_id
         WHERE bs.product_id = $1::uuid
           AND bs.deleted_at IS NULL
           AND b.deleted_at IS NULL
         ORDER BY b.code ASC`,
        productId,
      ),
      client.$queryRawUnsafe<VelocityRow[]>(
        `SELECT product_id,
                COALESCE(SUM(ABS(qty_delta)), 0)::bigint AS qty
         FROM stock_movements
         WHERE kind = 'sale'
           AND occurred_at > now() - INTERVAL '30 days'
           AND product_id = $1::uuid
         GROUP BY product_id`,
        productId,
      ),
    ]);

    const per_branch_stock: PerBranchStock[] = branchRows.map((r) => ({
      branch_id: r.branch_id,
      branch_code: r.branch_code,
      branch_name_i18n: r.branch_name_i18n as { en: string; ar: string },
      qty_on_hand: r.qty_on_hand,
      reorder_point: r.reorder_point,
      reorder_qty: r.reorder_qty,
      // 1.9: a `reserved` column will land with stock transfers. Until then,
      // available == on-hand.
      available: r.qty_on_hand,
      last_movement_at: r.last_movement_at ? r.last_movement_at.toISOString() : null,
    }));

    const totalQty = per_branch_stock.reduce((sum, b) => sum + b.qty_on_hand, 0);
    const totalStockValueCents = BigInt(totalQty) * base.cost_cents;
    const unitsSold30d = unitsSold30dRows[0]?.qty != null
      ? (typeof unitsSold30dRows[0].qty === "bigint"
          ? Number(unitsSold30dRows[0].qty)
          : Number(unitsSold30dRows[0].qty))
      : 0;
    const velocityPerDay = unitsSold30d / 30;
    const daysOfCover = velocityPerDay > 0 ? Math.round(totalQty / velocityPerDay) : null;

    return {
      ...base,
      per_branch_stock,
      kpis: {
        total_stock_value_cents: totalStockValueCents.toString(),
        units_sold_30d: unitsSold30d,
        velocity_per_day: Math.round(velocityPerDay * 10) / 10,
        days_of_cover: daysOfCover,
      },
    };
  }

  async getProductMovements(
    tenantId: string,
    productId: string,
    opts: { page: number; limit: number },
  ): Promise<{ items: ApiMovementItem[]; total: number; page: number; limit: number }> {
    const scoped = tenantScoped(tenantId);
    // Confirm product exists + visible under this tenant.
    const product = await scoped.product.findUnique({ where: { id: productId } });
    if (!product || product.deleted_at) {
      throw new NotFoundException({ code: "product_not_found", message: "Product not found" });
    }

    const skip = (opts.page - 1) * opts.limit;
    const [rows, total, branches] = await Promise.all([
      scoped.stockMovement.findMany({
        where: { product_id: productId },
        orderBy: { occurred_at: "desc" },
        skip,
        take: opts.limit,
      }),
      scoped.stockMovement.count({ where: { product_id: productId } }),
      scoped.branch.findMany({ select: { id: true, code: true } }),
    ]);

    const branchById = new Map(branches.map((b) => [b.id, b.code]));

    return {
      items: rows.map((r) => ({
        id: r.id,
        branch_id: r.branch_id,
        branch_code: branchById.get(r.branch_id) ?? "(deleted)",
        kind: r.kind,
        qty_delta: r.qty_delta,
        unit_cost_cents: r.unit_cost_cents?.toString() ?? null,
        reference_table: r.reference_table,
        reference_id: r.reference_id,
        note: r.note,
        occurred_at: r.occurred_at.toISOString(),
      })),
      total,
      page: opts.page,
      limit: opts.limit,
    };
  }

  async getProductActivity(
    tenantId: string,
    productId: string,
    opts: { page: number; limit: number },
  ): Promise<{ items: ApiActivityItem[]; total: number; page: number; limit: number }> {
    const scoped = tenantScoped(tenantId);
    // Confirm product is visible under this tenant.
    const product = await scoped.product.findUnique({ where: { id: productId } });
    if (!product || product.deleted_at) {
      throw new NotFoundException({ code: "product_not_found", message: "Product not found" });
    }

    const skip = (opts.page - 1) * opts.limit;
    const [rows, total] = await Promise.all([
      scoped.auditLog.findMany({
        where: { entity: "product", entity_id: productId },
        orderBy: { created_at: "desc" },
        skip,
        take: opts.limit,
      }),
      scoped.auditLog.count({ where: { entity: "product", entity_id: productId } }),
    ]);

    const userIds = Array.from(
      new Set(rows.map((r) => r.user_id).filter((id): id is string => Boolean(id))),
    );
    const users = userIds.length
      ? await scoped.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(users.map((u) => [u.id, u.name]));

    return {
      items: rows.map((r) => ({
        id: r.id,
        user_id: r.user_id,
        user_name: r.user_id ? nameById.get(r.user_id) ?? null : null,
        impersonator_id: r.impersonator_id,
        action: r.action,
        before: r.before,
        after: r.after,
        created_at: r.created_at.toISOString(),
      })),
      total,
      page: opts.page,
      limit: opts.limit,
    };
  }

  async streamProductImage(
    tenantId: string,
    productId: string,
  ): Promise<{ buffer: Buffer; mime: string; filename: string }> {
    const scoped = tenantScoped(tenantId);
    const product = await scoped.product.findUnique({
      where: { id: productId },
      select: { image_url: true, sku: true, deleted_at: true },
    });
    if (!product || product.deleted_at || !product.image_url) {
      throw new NotFoundException({ code: "image_not_found", message: "No image set for this product" });
    }
    const buffer = await this.storage.get(product.image_url);
    const ext = product.image_url.split(".").pop()?.toLowerCase() ?? "jpg";
    const mime =
      ext === "png"
        ? "image/png"
        : ext === "webp"
          ? "image/webp"
          : "image/jpeg";
    return { buffer, mime, filename: `${product.sku}.${ext}` };
  }
}

function serializeChanges(body: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (typeof v === "bigint") result[k] = v.toString();
    else if (typeof v === "number" && (k.endsWith("_cents") || k === "price_cents" || k === "cost_cents"))
      result[k] = v.toString();
    else result[k] = v;
  }
  return result;
}

interface RawProduct {
  id: string;
  sku: string;
  name_i18n: unknown;
  description_i18n: unknown;
  category_id: string | null;
  tax_class_id: string | null;
  price_cents: bigint;
  cost_cents: bigint;
  currency_code: string;
  barcode: string | null;
  is_active: boolean;
  image_url: string | null;
}

interface RawCategory {
  id: string;
  code: string;
  name_i18n: unknown;
  sort_order: number;
  parent_id: string | null;
}

interface VelocityRow {
  product_id: string;
  qty: bigint | number;
}

interface PerBranchStockRow {
  branch_id: string;
  branch_code: string;
  branch_name_i18n: unknown;
  qty_on_hand: number;
  reorder_point: number | null;
  reorder_qty: number | null;
  last_movement_at: Date | null;
}
