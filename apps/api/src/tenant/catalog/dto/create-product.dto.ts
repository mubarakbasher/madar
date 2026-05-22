import { z } from "zod";

const I18N_TEXT = z.object({
  en: z.string().trim().min(1).max(200),
  ar: z.string().trim().min(1).max(200),
});

const I18N_TEXT_OPTIONAL = z
  .object({
    en: z.string().trim().max(2000).optional(),
    ar: z.string().trim().max(2000).optional(),
  })
  .optional();

const SKU = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[A-Z0-9-]+$/, "SKU may only contain uppercase letters, digits, and dashes");

const InitialStockEntry = z.object({
  branch_id: z.string().uuid(),
  qty: z.coerce.number().int().min(0).max(1_000_000),
  reorder_point: z.coerce.number().int().min(0).max(1_000_000).optional(),
  reorder_qty: z.coerce.number().int().min(0).max(1_000_000).optional(),
});

export const CreateProductSchema = z.object({
  sku: SKU,
  name_i18n: I18N_TEXT,
  description_i18n: I18N_TEXT_OPTIONAL,
  category_id: z.string().uuid().nullable().optional(),
  tax_class_id: z.string().uuid().nullable().optional(),
  price_cents: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  cost_cents: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  currency_code: z.string().length(3).toUpperCase(),
  barcode: z.string().trim().min(1).max(64).nullable().optional(),
  is_active: z.boolean().optional().default(true),
  initial_stock: z.array(InitialStockEntry).max(50).optional(),
});

export type CreateProductBody = z.infer<typeof CreateProductSchema>;
