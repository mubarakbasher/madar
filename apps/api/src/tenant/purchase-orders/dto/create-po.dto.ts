import { z } from "zod";

/**
 * Line schema for create/update. `unit_cost_cents` is optional — when omitted
 * the service falls back to the supplier_products catalog row for the
 * (supplier_id, product_id) pair.
 */
const Line = z.object({
  product_id: z.string().uuid(),
  qty_ordered: z.coerce.number().int().min(1).max(1_000_000),
  unit_cost_cents: z.coerce.number().int().min(1).max(1_000_000_000_000).optional(),
});

export const CreatePurchaseOrderSchema = z.object({
  supplier_id: z.string().uuid(),
  branch_id: z.string().uuid(),
  expected_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "expected_at must be YYYY-MM-DD")
    .optional(),
  notes: z.string().max(2000).optional(),
  tax_cents: z.coerce.number().int().min(0).max(1_000_000_000_000).optional(),
  shipping_cents: z.coerce.number().int().min(0).max(1_000_000_000_000).optional(),
  lines: z.array(Line).min(1).max(500),
});

export type CreatePurchaseOrderBody = z.infer<typeof CreatePurchaseOrderSchema>;
export type CreatePurchaseOrderLine = z.infer<typeof Line>;
