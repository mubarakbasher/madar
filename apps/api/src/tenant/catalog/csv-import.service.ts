import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  forwardRef,
} from "@nestjs/common";
// Catalog upsert needs raw Prisma access to the tenant-scoped client.
// eslint-disable-next-line no-restricted-imports
import { tenantScoped } from "@madar/db";
import { AuditService, type AuditCtx } from "../auth/audit.service";

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 5000;

const REQUIRED_COLUMNS = ["sku", "name_en", "price_cents", "cost_cents"] as const;
const KNOWN_COLUMNS = [
  "sku",
  "name_en",
  "name_ar",
  "category_code",
  "price_cents",
  "cost_cents",
  "barcode",
  "tax_class_code",
  "branch_code",
  "initial_qty",
  "is_active",
] as const;
type Column = (typeof KNOWN_COLUMNS)[number];

export interface CsvImportError {
  row: number;
  sku: string | null;
  code: string;
  message: string;
}

export interface CsvImportResult {
  created: number;
  updated: number;
  errors: CsvImportError[];
  total_rows: number;
}

interface ParsedRow {
  rowNumber: number; // 1-based, excluding header
  cells: Record<string, string>;
}

/**
 * RFC 4180-ish CSV parser. Handles:
 *   - Comma sep
 *   - Double-quoted fields ("text with, comma")
 *   - Escaped quotes inside quoted fields ("she said ""hi""")
 *   - LF or CRLF line endings
 *   - Header row required
 *
 * No support for: alternate delimiters, BOM stripping beyond UTF-8, blank
 * trailing newlines (they're tolerated but produce no rows).
 */
function parseCsv(text: string): { header: string[]; rows: string[][] } {
  // Strip UTF-8 BOM if present.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let current: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        // Escaped quote?
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      current.push(cell);
      cell = "";
      i += 1;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      // Push the last cell + the row, skip CRLF as one.
      current.push(cell);
      // Drop trailing fully-empty rows from a trailing newline.
      if (!(current.length === 1 && current[0] === "")) {
        rows.push(current);
      }
      current = [];
      cell = "";
      if (ch === "\r" && text[i + 1] === "\n") i += 2;
      else i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  if (cell.length > 0 || current.length > 0) {
    current.push(cell);
    if (!(current.length === 1 && current[0] === "")) rows.push(current);
  }
  if (rows.length === 0) {
    throw new BadRequestException({
      code: "csv_empty",
      message: "CSV file is empty",
    });
  }
  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  return { header, rows: rows.slice(1) };
}

@Injectable()
export class CsvImportService {
  private readonly logger = new Logger(CsvImportService.name);

  constructor(private readonly audit: AuditService) {}

  async importProducts(
    tenantId: string,
    actorId: string,
    file: { buffer: Buffer; originalName: string },
    opts: { dryRun: boolean },
    ctx: AuditCtx,
  ): Promise<CsvImportResult> {
    if (file.buffer.length > MAX_BYTES) {
      throw new BadRequestException({
        code: "csv_too_large",
        message: "CSV file must be 2MB or smaller",
      });
    }

    const text = file.buffer.toString("utf8");
    const { header, rows } = parseCsv(text);

    // Validate required columns.
    for (const required of REQUIRED_COLUMNS) {
      if (!header.includes(required)) {
        throw new BadRequestException({
          code: "csv_missing_column",
          message: `Missing required column: ${required}`,
        });
      }
    }
    if (rows.length > MAX_ROWS) {
      throw new BadRequestException({
        code: "csv_too_many_rows",
        message: `Up to ${MAX_ROWS} rows per import (got ${rows.length})`,
      });
    }

    // Map header → column index for known columns; ignore unknown.
    const colIndex: Partial<Record<Column, number>> = {};
    for (const known of KNOWN_COLUMNS) {
      const idx = header.indexOf(known);
      if (idx !== -1) colIndex[known] = idx;
    }

    const parsedRows: ParsedRow[] = rows.map((cells, i) => {
      const out: Record<string, string> = {};
      for (const known of KNOWN_COLUMNS) {
        const idx = colIndex[known];
        if (idx === undefined) continue;
        out[known] = (cells[idx] ?? "").trim();
      }
      return { rowNumber: i + 1, cells: out };
    });

    // Pre-resolve all referenced category_codes, tax_class_codes, branch_codes
    // in one pass to keep per-row work cheap.
    const scoped = tenantScoped(tenantId);
    const refCategoryCodes = new Set(
      parsedRows.map((r) => r.cells.category_code).filter(Boolean) as string[],
    );
    const refTaxCodes = new Set(
      parsedRows.map((r) => r.cells.tax_class_code).filter(Boolean) as string[],
    );
    const refBranchCodes = new Set(
      parsedRows.map((r) => r.cells.branch_code).filter(Boolean) as string[],
    );

    const [categories, taxClasses, branches] = await Promise.all([
      refCategoryCodes.size === 0
        ? []
        : scoped.category.findMany({
            where: { code: { in: Array.from(refCategoryCodes) }, deleted_at: null },
            select: { id: true, code: true },
          }),
      refTaxCodes.size === 0
        ? []
        : scoped.taxClass.findMany({
            where: { code: { in: Array.from(refTaxCodes) }, deleted_at: null },
            select: { id: true, code: true },
          }),
      refBranchCodes.size === 0
        ? []
        : scoped.branch.findMany({
            where: { code: { in: Array.from(refBranchCodes) }, deleted_at: null },
            select: { id: true, code: true },
          }),
    ]);
    const catByCode = new Map(
      (categories as Array<{ id: string; code: string }>).map((c) => [c.code, c.id]),
    );
    const taxByCode = new Map(
      (taxClasses as Array<{ id: string; code: string }>).map((c) => [c.code, c.id]),
    );
    const branchByCode = new Map(
      (branches as Array<{ id: string; code: string }>).map((c) => [c.code, c.id]),
    );

    const errors: CsvImportError[] = [];
    let created = 0;
    let updated = 0;

    for (const r of parsedRows) {
      const sku = r.cells.sku?.toUpperCase().trim();
      if (!sku) {
        errors.push({ row: r.rowNumber, sku: null, code: "missing_sku", message: "SKU is required" });
        continue;
      }
      const nameEn = r.cells.name_en;
      if (!nameEn) {
        errors.push({ row: r.rowNumber, sku, code: "missing_name_en", message: "name_en is required" });
        continue;
      }
      const priceRaw = r.cells.price_cents;
      const costRaw = r.cells.cost_cents;
      const price = Number(priceRaw);
      const cost = Number(costRaw);
      if (!Number.isFinite(price) || price < 0 || !Number.isInteger(price)) {
        errors.push({
          row: r.rowNumber,
          sku,
          code: "invalid_price",
          message: `price_cents must be a non-negative integer (got "${priceRaw}")`,
        });
        continue;
      }
      if (!Number.isFinite(cost) || cost < 0 || !Number.isInteger(cost)) {
        errors.push({
          row: r.rowNumber,
          sku,
          code: "invalid_cost",
          message: `cost_cents must be a non-negative integer (got "${costRaw}")`,
        });
        continue;
      }

      const categoryCode = r.cells.category_code || null;
      let categoryId: string | null = null;
      if (categoryCode) {
        const found = catByCode.get(categoryCode);
        if (!found) {
          errors.push({
            row: r.rowNumber,
            sku,
            code: "unknown_category",
            message: `category_code "${categoryCode}" not found`,
          });
          continue;
        }
        categoryId = found;
      }

      const taxCode = r.cells.tax_class_code || null;
      let taxClassId: string | null = null;
      if (taxCode) {
        const found = taxByCode.get(taxCode);
        if (!found) {
          errors.push({
            row: r.rowNumber,
            sku,
            code: "unknown_tax_class",
            message: `tax_class_code "${taxCode}" not found`,
          });
          continue;
        }
        taxClassId = found;
      }

      const branchCode = r.cells.branch_code || null;
      const initialQty = r.cells.initial_qty ? Number(r.cells.initial_qty) : 0;
      let branchId: string | null = null;
      if (branchCode && initialQty > 0) {
        const found = branchByCode.get(branchCode);
        if (!found) {
          errors.push({
            row: r.rowNumber,
            sku,
            code: "unknown_branch",
            message: `branch_code "${branchCode}" not found`,
          });
          continue;
        }
        branchId = found;
      }

      const isActive = r.cells.is_active
        ? !["false", "0", "no"].includes(r.cells.is_active.toLowerCase())
        : true;

      const data = {
        sku,
        name_i18n: { en: nameEn, ar: r.cells.name_ar || nameEn },
        category_id: categoryId,
        tax_class_id: taxClassId,
        price_cents: BigInt(price),
        cost_cents: BigInt(cost),
        barcode: r.cells.barcode || null,
        is_active: isActive,
        currency_code: "USD" as const, // overridden by the existing product if updating
      };

      if (opts.dryRun) {
        // Dry-run — just classify as create-or-update.
        const exists = await scoped.product.findFirst({
          where: { sku, deleted_at: null },
          select: { id: true },
        });
        if (exists) updated++;
        else created++;
        continue;
      }

      try {
        const existing = await scoped.product.findFirst({
          where: { sku, deleted_at: null },
          select: { id: true, currency_code: true },
        });
        if (existing) {
          await scoped.product.update({
            where: { id: existing.id },
            data: {
              name_i18n: data.name_i18n,
              category_id: data.category_id,
              tax_class_id: data.tax_class_id,
              price_cents: data.price_cents,
              cost_cents: data.cost_cents,
              barcode: data.barcode,
              is_active: data.is_active,
            },
          });
          updated++;
        } else {
          // Look up tenant default currency so new products inherit it.
          const tenant = (await scoped.product.findFirst({
            select: { currency_code: true },
          })) ?? { currency_code: "USD" };
          const product = await scoped.product.create({
            data: {
              ...data,
              tenant_id: tenantId,
              currency_code: tenant.currency_code,
              created_by: actorId,
            },
          });
          if (branchId && initialQty > 0) {
            await scoped.stockMovement.create({
              data: {
                tenant_id: tenantId,
                branch_id: branchId,
                product_id: product.id,
                kind: "adjustment",
                qty_delta: initialQty,
                unit_cost_cents: data.cost_cents,
                currency_code: product.currency_code,
                note: "csv_import",
                created_by: actorId,
              },
            });
            await scoped.branchStock.upsert({
              where: {
                tenant_id_branch_id_product_id: {
                  tenant_id: tenantId,
                  branch_id: branchId,
                  product_id: product.id,
                },
              },
              update: {
                qty_on_hand: { increment: initialQty },
                last_movement_at: new Date(),
              },
              create: {
                tenant_id: tenantId,
                branch_id: branchId,
                product_id: product.id,
                qty_on_hand: initialQty,
                last_movement_at: new Date(),
                created_by: actorId,
              },
            });
          }
          created++;
        }
      } catch (e) {
        const code = (e as { code?: string } | undefined)?.code;
        if (code === "P2002") {
          errors.push({
            row: r.rowNumber,
            sku,
            code: "sku_taken",
            message: `SKU "${sku}" already exists`,
          });
        } else {
          this.logger.warn(`csv import row ${r.rowNumber} failed: ${(e as Error).message}`);
          errors.push({
            row: r.rowNumber,
            sku,
            code: "row_failed",
            message: (e as Error).message,
          });
        }
      }
    }

    if (!opts.dryRun) {
      await this.audit
        .writeTenantScoped(ctx, {
          action: "product_import_completed",
          entity: "tenant",
          entityId: tenantId,
          after: {
            file: file.originalName,
            created,
            updated,
            errors: errors.length,
            total_rows: parsedRows.length,
          },
        })
        .catch((e) =>
          this.logger.warn(`audit write failed: ${(e as Error).message}`),
        );
    }

    return {
      created,
      updated,
      errors,
      total_rows: parsedRows.length,
    };
  }
}
