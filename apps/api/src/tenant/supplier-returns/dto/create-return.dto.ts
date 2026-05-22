import { z } from "zod";

/**
 * Line schema for supplier-return create/update.
 *
 * `reason_code` is a free-form short token — we suggest the conventional
 * vocabulary (`damaged | wrong_item | expired | other`) but deliberately do
 * NOT validate against an enum. Tenants may add domain-specific codes (e.g.
 * `expired_lot_qa-2026-08`) without a schema migration.
 */
const Line = z.object({
  product_id: z.string().uuid(),
  qty: z.coerce.number().int().min(1).max(1_000_000),
  unit_cost_cents: z.coerce.number().int().min(0).max(1_000_000_000_000),
  reason_code: z.string().max(32).optional(),
});

export const CreateSupplierReturnSchema = z.object({
  supplier_id: z.string().uuid(),
  branch_id: z.string().uuid(),
  reason: z.string().min(1).max(500),
  notes: z.string().max(2000).optional(),
  lines: z.array(Line).min(1).max(500),
});

export type CreateSupplierReturnBody = z.infer<typeof CreateSupplierReturnSchema>;
export type CreateSupplierReturnLine = z.infer<typeof Line>;
