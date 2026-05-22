import { z } from "zod";

export const PnlQuerySchema = z
  .object({
    currency: z
      .string()
      .length(3)
      .transform((s) => s.toUpperCase()),
    from: z.string().date(),
    to: z.string().date(),
    branch_id: z.string().uuid().optional(),
    category_id: z.string().uuid().optional(),
    group_by: z.enum(["period", "branch", "category", "sku"]).optional().default("period"),
    format: z.enum(["json", "csv"]).optional().default("json"),
  })
  .refine((d) => new Date(d.from) <= new Date(d.to), {
    message: "from must be ≤ to",
    path: ["from"],
  });

export type PnlQuery = z.infer<typeof PnlQuerySchema>;
