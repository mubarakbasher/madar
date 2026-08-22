import { z } from "zod";

export const ListQuotationsQuerySchema = z.object({
  branch_id: z.string().uuid(),
  status: z.enum(["open", "converted", "cancelled", "expired"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

export type ListQuotationsQuery = z.infer<typeof ListQuotationsQuerySchema>;
