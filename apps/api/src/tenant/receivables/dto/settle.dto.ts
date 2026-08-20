import { z } from "zod";

const BigIntable = z.union([z.string(), z.number()]).transform((v) =>
  typeof v === "string" ? BigInt(v) : BigInt(Math.round(v)),
);

export const SettleReceivableSchema = z
  .object({
    sale_id: z.string().uuid(),
    method: z.enum(["cash", "card", "bank_transfer"]),
    amount_cents: BigIntable,
    approval_code: z.string().min(4).max(20).optional(),
    cash_tendered_cents: BigIntable.optional(),
  })
  .superRefine((d, ctx) => {
    if (d.method === "card" && !d.approval_code) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["approval_code"],
        message: "approval_code is required for card settlements",
      });
    }
    if (d.method === "cash" && d.cash_tendered_cents == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cash_tendered_cents"],
        message: "cash_tendered_cents is required for cash settlements",
      });
    }
  });

export type SettleReceivableBody = z.infer<typeof SettleReceivableSchema>;
