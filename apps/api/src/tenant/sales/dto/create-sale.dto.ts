import { z } from "zod";

const UuidSchema = z.string().uuid();

const BigIntable = z
  .union([z.string(), z.number()])
  .transform((v) =>
    typeof v === "string" ? BigInt(v) : BigInt(Math.round(v)),
  );

const CartLineSchema = z.object({
  product_id: UuidSchema,
  qty: z.number().int().positive(),
  line_discount_cents: z.number().int().nonnegative().default(0),
  note: z.string().max(280).nullable().optional(),
});

const PaymentMethodEnum = z.enum([
  "cash",
  "card",
  "bank_transfer",
  "store_credit",
]);

export const SalePaymentInputSchema = z.object({
  method: PaymentMethodEnum,
  amount_cents: BigIntable,
  approval_code: z.string().min(4).max(20).optional(),
  cash_tendered_cents: BigIntable.optional(),
});

export const CreateSaleSchema = z
  .object({
    branch_id: UuidSchema,
    customer_id: UuidSchema.nullable().default(null),
    currency_code: z.string().length(3).transform((s) => s.toUpperCase()),
    payment_method: PaymentMethodEnum.optional(),
    approval_code: z.string().min(4).max(20).optional(),
    client_uuid: UuidSchema,
    client_sequence: z.number().int().positive().nullable().default(null),
    client_occurred_at: z.string().datetime().optional(),
    offline_completed: z.boolean().optional().default(false),
    lines: z.array(CartLineSchema).min(1, "At least one line is required"),
    cash_tendered_cents: z.number().int().nonnegative().nullable().optional(),
    payments: z.array(SalePaymentInputSchema).min(1).max(8).optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.payments && !data.payment_method) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["payment_method"],
        message: "Either payments[] or payment_method is required",
      });
      return;
    }
    if (!data.payments && data.payment_method === "cash" && data.cash_tendered_cents == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cash_tendered_cents"],
        message: "cash_tendered_cents is required when payment_method='cash'",
      });
    }
    if (!data.payments && data.payment_method === "card" && !data.approval_code) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["approval_code"],
        message: "approval_code is required when payment_method='card'",
      });
    }
  });

export type CreateSaleInput = z.infer<typeof CreateSaleSchema>;
export type SalePaymentInput = z.infer<typeof SalePaymentInputSchema>;
export type CartLineInput = z.infer<typeof CartLineSchema>;
