import { z } from "zod";

export const AdminRejectProofSchema = z.object({
  rejection_reason: z.string().min(1).max(280),
  notes: z.string().max(1000).optional().nullable(),
});

export type AdminRejectProofBody = z.infer<typeof AdminRejectProofSchema>;
