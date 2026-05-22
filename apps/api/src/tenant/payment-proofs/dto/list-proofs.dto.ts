import { z } from "zod";

export const ListProofsQuerySchema = z.object({
  context: z.enum(["sale", "subscription"]).optional(),
  status: z.enum(["pending", "verified", "rejected", "cancelled"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type ListProofsQuery = z.infer<typeof ListProofsQuerySchema>;
