import { z } from "zod";

export const ListTransfersQuerySchema = z.object({
  status: z.enum(["draft", "in_transit", "received", "cancelled"]).optional(),
  from_branch_id: z.string().uuid().optional(),
  to_branch_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type ListTransfersQuery = z.infer<typeof ListTransfersQuerySchema>;
