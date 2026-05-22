import { z } from "zod";

const BIGINT_STRING = z
  .string()
  .trim()
  .regex(/^-?\d+$/, "Must be an integer expressed as a string");

export const HeldSaleLineSchema = z.object({
  product_id: z.string().uuid(),
  qty: z.number().int().positive().max(100000),
  unit_price_cents: BIGINT_STRING,
  discount_cents: BIGINT_STRING.optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

export const PutHeldSaleSchema = z.object({
  branch_id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  note: z.string().trim().max(500).nullable().optional(),
  customer_id: z.string().uuid().nullable().optional(),
  currency_code: z.string().trim().toUpperCase().length(3),
  subtotal_cents: BIGINT_STRING,
  discount_cents: BIGINT_STRING,
  tax_cents: BIGINT_STRING,
  total_cents: BIGINT_STRING,
  lines: z.array(HeldSaleLineSchema).min(1).max(500),
});

export type HeldSaleLineBody = z.infer<typeof HeldSaleLineSchema>;
export type PutHeldSaleBody = z.infer<typeof PutHeldSaleSchema>;
