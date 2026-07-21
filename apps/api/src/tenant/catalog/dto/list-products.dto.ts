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
  // POS loads its offline catalog snapshot through this endpoint with no
  // args, so the default stays "first 500" — inventory passes page + limit=50.
  page: intParam(1, 1, 10_000),
  limit: intParam(500, 1, 500),
  sort: z.enum(["sku", "name", "price", "cost", "stock", "vel"]).default("sku"),
  dir: z.enum(["asc", "desc"]).default("asc"),
  name_locale: z.enum(["en", "ar"]).default("en"),
});

export type ListProductsQuery = z.infer<typeof ListProductsQuerySchema>;
