import { z } from "zod";

/**
 * Query DTO for GET /v1/reports/trends.
 *
 * - `currency` is required (3-char ISO 4217, uppercased) so the response is
 *   single-currency and aggregations are comparable.
 * - `metric` controls which series we return: revenue (cents), transactions
 *   (count), or gross_profit (cents). Rolling avg + summary follow the metric.
 * - `window` is the rolling-window length in days. PAGES §41 locks the choices
 *   to 7/30/90 — we refine the coerced number rather than `z.union` so the
 *   error message stays predictable.
 * - `compare` selects the overlay series. `none` returns null for value_prev.
 * - `branch_id` is optional; when set, filters all aggregations to that branch.
 */
export const TrendsQuerySchema = z.object({
  currency: z
    .string()
    .length(3)
    .transform((s) => s.toUpperCase()),
  metric: z.enum(["revenue", "transactions", "gross_profit"]).optional().default("revenue"),
  window: z.coerce
    .number()
    .refine((v) => v === 7 || v === 30 || v === 90, {
      message: "window must be 7, 30, or 90",
    })
    .optional()
    .default(30),
  compare: z.enum(["yoy", "prev_period", "none"]).optional().default("none"),
  branch_id: z.string().uuid().optional(),
});

export type TrendsQuery = z.infer<typeof TrendsQuerySchema>;
