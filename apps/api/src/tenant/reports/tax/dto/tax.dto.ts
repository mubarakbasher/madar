import { z } from "zod";

/**
 * Query DTO for GET /v1/reports/tax.
 *
 * Currency is required — the report is single-currency by design (no cross-
 * currency aggregation; mixed-currency tenants run separate reports per ccy).
 * `branch_id` narrows to a single branch; omitted = chain-wide.
 */
export const TaxQuerySchema = z
  .object({
    currency: z
      .string()
      .length(3)
      .transform((s) => s.toUpperCase()),
    from: z.string().date(),
    to: z.string().date(),
    branch_id: z.string().uuid().optional(),
    format: z.enum(["json", "pdf", "csv"]).optional().default("json"),
  })
  .strict();

export type TaxQuery = z.infer<typeof TaxQuerySchema>;
