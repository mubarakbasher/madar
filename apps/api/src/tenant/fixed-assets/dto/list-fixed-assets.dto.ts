import { z } from "zod";

const intParam = (def: number, min: number, max: number) =>
  z
    .preprocess((v) => {
      if (typeof v === "number") return v;
      if (typeof v === "string" && v.trim().length > 0) {
        const n = Number(v);
        if (Number.isFinite(n)) return n;
      }
      return def;
    }, z.number().int().min(min).max(max))
    .default(def);

export const ListFixedAssetsQuerySchema = z.object({
  search: z.string().trim().max(160).optional(),
  branch_id: z.string().uuid().optional(),
  page: intParam(1, 1, 10_000),
  limit: intParam(50, 1, 200),
});

export type ListFixedAssetsQuery = z.infer<typeof ListFixedAssetsQuerySchema>;
