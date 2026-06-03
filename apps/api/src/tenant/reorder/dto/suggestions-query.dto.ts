import { z } from "zod";

/**
 * Reorder-suggestions query. `horizon_days` is the run-out window: a SKU is
 * "at risk" when its days-of-cover (on-hand ÷ 30-day velocity) falls at or
 * below it. Defaults to 7 to match the inventory nudge copy.
 */
export const ReorderSuggestionsQuerySchema = z.object({
  branch_id: z.string().uuid(),
  horizon_days: z.coerce.number().int().min(1).max(90).default(7),
});

export type ReorderSuggestionsQuery = z.infer<typeof ReorderSuggestionsQuerySchema>;
