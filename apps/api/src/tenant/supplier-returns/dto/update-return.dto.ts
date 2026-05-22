import { z } from "zod";

/**
 * UpdateBody mirrors CreateBody — lines are replaced wholesale (matches the
 * purchase-order pattern). `code` is never client-editable; we don't accept it
 * here. PATCH is only valid while status='draft' — the service enforces.
 */
const Line = z.object({
  product_id: z.string().uuid(),
  qty: z.coerce.number().int().min(1).max(1_000_000),
  unit_cost_cents: z.coerce.number().int().min(0).max(1_000_000_000_000),
  reason_code: z.string().max(32).optional(),
});

export const UpdateSupplierReturnSchema = z.object({
  supplier_id: z.string().uuid(),
  branch_id: z.string().uuid(),
  reason: z.string().min(1).max(500),
  notes: z.string().max(2000).nullable().optional(),
  lines: z.array(Line).min(1).max(500),
});

export type UpdateSupplierReturnBody = z.infer<typeof UpdateSupplierReturnSchema>;
export type UpdateSupplierReturnLine = z.infer<typeof Line>;
