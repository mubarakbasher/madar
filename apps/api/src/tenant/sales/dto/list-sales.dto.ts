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

export const ListSalesQuerySchema = z.object({
  branch_id: z.string().uuid().optional(),
  customer_id: z.string().uuid().optional(),
  payment_method: z
    .enum(["cash", "card", "bank_transfer", "store_credit", "split"])
    .optional(),
  payment_status: z
    .enum(["paid", "payment_pending", "disputed", "refunded"])
    .optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: intParam(1, 1, 10_000),
  limit: intParam(50, 1, 200),
});

export type ListSalesQuery = z.infer<typeof ListSalesQuerySchema>;
