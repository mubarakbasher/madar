import { z } from "zod";

/**
 * Query DTO for GET /v1/reports/movers.
 *
 * Ranks products by revenue, units, or gross profit over a date window
 * (inclusive `from`, inclusive `to`). Optional `branch_id` / `category_id`
 * filters narrow the result set. `limit` caps top-N (slow-movers list uses
 * its own fixed cap of 10 server-side).
 */
export const MoversQuerySchema = z
  .object({
    currency: z
      .string()
      .length(3)
      .transform((s) => s.toUpperCase()),
    from: z.string().date(),
    to: z.string().date(),
    branch_id: z.string().uuid().optional(),
    category_id: z.string().uuid().optional(),
    metric: z.enum(["revenue", "units", "profit"]).optional().default("revenue"),
    limit: z.coerce.number().int().positive().max(100).optional().default(20),
  })
  .strict()
  .refine((q) => q.from <= q.to, {
    message: "`from` must be on or before `to`",
    path: ["from"],
  });

export type MoversQuery = z.infer<typeof MoversQuerySchema>;
