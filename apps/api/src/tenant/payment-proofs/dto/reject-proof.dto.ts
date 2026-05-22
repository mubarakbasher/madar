import { z } from "zod";

export const RejectProofSchema = z.object({
  rejection_reason: z.string().min(1).max(280),
  notes: z.string().max(1000).optional().nullable(),
});

export type RejectProofBody = z.infer<typeof RejectProofSchema>;
