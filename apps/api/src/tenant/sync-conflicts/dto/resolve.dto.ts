import { z } from "zod";

export const ResolveSyncConflictSchema = z.object({
  resolution_status: z.enum(["acknowledged", "resolved", "ignored"]),
  review_notes: z.string().max(2000).nullable().optional(),
});

export type ResolveSyncConflictBody = z.infer<typeof ResolveSyncConflictSchema>;
