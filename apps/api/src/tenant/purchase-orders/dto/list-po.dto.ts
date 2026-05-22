import { z } from "zod";

export const ListPurchaseOrdersQuerySchema = z.object({
  status: z.enum(["draft", "ordered", "received", "cancelled"]).optional(),
  supplier_id: z.string().uuid().optional(),
  branch_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type ListPurchaseOrdersQuery = z.infer<typeof ListPurchaseOrdersQuerySchema>;
