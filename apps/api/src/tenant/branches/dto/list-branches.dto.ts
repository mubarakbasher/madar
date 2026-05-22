import { z } from "zod";

export const ListBranchesQuerySchema = z.object({
  include_inactive: z
    .preprocess((v) => {
      if (typeof v === "boolean") return v;
      if (v === "true" || v === "1") return true;
      if (v === "false" || v === "0" || v === undefined) return false;
      return v;
    }, z.boolean())
    .default(false),
});

export type ListBranchesQuery = z.infer<typeof ListBranchesQuerySchema>;
