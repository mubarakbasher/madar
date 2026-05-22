import { z } from "zod";

const intOrString = z.union([z.number().int(), z.string().regex(/^\d+$/)]).transform((v) => BigInt(v));

const RefundPaymentSchema = z.object({
  method: z.enum(["cash", "card", "bank_transfer", "store_credit"]),
  amount_cents: intOrString,
  approval_code: z.string().trim().min(4).max(20).optional(),
});

const RefundLineSchema = z.object({
  sale_line_id: z.string().uuid(),
  qty: z.number().int().positive(),
  restock: z.boolean().optional().default(true),
});

export const CreateRefundSchema = z.object({
  sale_id: z.string().uuid(),
  lines: z.array(RefundLineSchema).min(1, "At least one line is required"),
  payments: z.array(RefundPaymentSchema).min(1, "At least one payment slice is required").max(8),
  notes: z.string().trim().max(2000).optional().nullable(),
  customer_id: z.string().uuid().optional().nullable(),
  approved_by_user_id: z.string().uuid().optional().nullable(),
});

export type CreateRefundBody = z.infer<typeof CreateRefundSchema>;
export type CreateRefundLine = z.infer<typeof RefundLineSchema>;
export type CreateRefundPayment = z.infer<typeof RefundPaymentSchema>;
