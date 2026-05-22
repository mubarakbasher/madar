import { z } from "zod";

/**
 * Query DTO for GET /v1/dashboard.
 *
 * Currently empty — the chain-wide view is hardcoded to "this week" (last 7
 * days) plus a rolling 30-day revenue series. A future timeframe selector
 * (e.g. ?range=14d|30d) lands here when product asks.
 *
 * Kept as a Zod schema so the controller stays consistent with the rest of
 * the tenant API surface (every other read uses ZodValidationPipe).
 */
export const DashboardQuerySchema = z.object({}).strict();
export type DashboardQuery = z.infer<typeof DashboardQuerySchema>;
