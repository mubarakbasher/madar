import { z } from "zod";

export const ListProductsQuerySchema = z.object({
  search: z.string().max(120).optional(),
  category_id: z.string().uuid().optional(),
  branch_id: z.string().uuid().optional(),
  only_low_stock: z
    .preprocess((v) => {
      if (typeof v === "boolean") return v;
      if (v === "true" || v === "1") return true;
      if (v === "false" || v === "0" || v === undefined) return false;
      return v;
    }, z.boolean())
    .default(false),
  limit: z.coerce.number().int().min(1).max(500).default(500),
});

export type ListProductsQuery = z.infer<typeof ListProductsQuerySchema>;
