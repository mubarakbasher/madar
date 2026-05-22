import { z } from "zod";

export const ListAdminProofsQuerySchema = z.object({
  context: z.enum(["sale", "subscription"]).optional(),
  status: z.enum(["pending", "verified", "rejected", "cancelled"]).optional(),
  tenant_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type ListAdminProofsQuery = z.infer<typeof ListAdminProofsQuerySchema>;
