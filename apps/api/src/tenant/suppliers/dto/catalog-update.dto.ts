import { z } from "zod";

// product_id is the resource identifier — not mutable via the body.
export const CatalogUpdateSchema = z
  .object({
    supplier_sku: z.string().trim().max(64).nullable().optional(),
    unit_cost_cents: z.coerce.number().int().min(1).max(1_000_000_000_000).optional(),
    currency_code: z.string().trim().toUpperCase().length(3).optional(),
    is_preferred: z.boolean().optional(),
    effective_from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "effective_from must be ISO date (YYYY-MM-DD)")
      .nullable()
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export type CatalogUpdateBody = z.infer<typeof CatalogUpdateSchema>;
