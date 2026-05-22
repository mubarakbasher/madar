import { z } from "zod";

export const ListHeldSalesQuerySchema = z.object({
  branch_id: z.string().uuid(),
  mine_only: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((v) => (v === false || v === "false" ? false : true)),
});

export type ListHeldSalesQuery = z.infer<typeof ListHeldSalesQuerySchema>;
