import { z } from "zod";

export const ListSyncConflictsSchema = z.object({
  status: z.enum(["open", "acknowledged", "resolved", "ignored"]).optional(),
  conflict_kind: z
    .enum(["negative_stock", "duplicate_uuid", "product_unknown", "price_drift"])
    .optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

export type ListSyncConflictsQuery = z.infer<typeof ListSyncConflictsSchema>;
