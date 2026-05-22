import { z } from "zod";

export const CatalogCreateSchema = z.object({
  product_id: z.string().uuid(),
  supplier_sku: z.string().trim().max(64).optional(),
  unit_cost_cents: z.coerce.number().int().min(1).max(1_000_000_000_000),
  currency_code: z.string().trim().toUpperCase().length(3).optional(),
  is_preferred: z.boolean().optional().default(false),
  effective_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "effective_from must be ISO date (YYYY-MM-DD)")
    .optional(),
});

export type CatalogCreateBody = z.infer<typeof CatalogCreateSchema>;
