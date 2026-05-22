import { z } from "zod";

export const BranchStockQuerySchema = z.object({
  search: z.string().max(120).optional(),
  low_only: z
    .preprocess((v) => {
      if (typeof v === "boolean") return v;
      if (v === "true" || v === "1") return true;
      if (v === "false" || v === "0" || v === undefined) return false;
      return v;
    }, z.boolean())
    .default(false),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type BranchStockQuery = z.infer<typeof BranchStockQuerySchema>;
