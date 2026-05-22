import { z } from "zod";

/**
 * UpdateBody mirrors CreateBody — replacements happen wholesale on the lines
 * array (matches the stock-transfer pattern). `code` is never client-editable;
 * we don't accept it here.
 */
const Line = z.object({
  product_id: z.string().uuid(),
  qty_ordered: z.coerce.number().int().min(1).max(1_000_000),
  unit_cost_cents: z.coerce.number().int().min(1).max(1_000_000_000_000).optional(),
});

export const UpdatePurchaseOrderSchema = z.object({
  supplier_id: z.string().uuid(),
  branch_id: z.string().uuid(),
  expected_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "expected_at must be YYYY-MM-DD")
    .nullable()
    .optional(),
  notes: z.string().max(2000).nullable().optional(),
  tax_cents: z.coerce.number().int().min(0).max(1_000_000_000_000).optional(),
  shipping_cents: z.coerce.number().int().min(0).max(1_000_000_000_000).optional(),
  lines: z.array(Line).min(1).max(500),
});

export type UpdatePurchaseOrderBody = z.infer<typeof UpdatePurchaseOrderSchema>;
export type UpdatePurchaseOrderLine = z.infer<typeof Line>;
