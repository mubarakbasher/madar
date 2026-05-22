import { z } from "zod";

export const SubmitProofSchema = z.object({
  context: z.enum(["sale", "subscription"]),
  reference_id: z.string().uuid(),
  // Multipart form fields arrive as strings; coerce.
  amount_cents: z
    .union([z.string(), z.number()])
    .transform((v) => BigInt(typeof v === "number" ? Math.trunc(v) : v))
    .refine((b) => b > 0n, { message: "amount_cents must be positive" }),
  currency_code: z
    .string()
    .length(3)
    .transform((s) => s.toUpperCase()),
  bank_account_kind: z.enum(["tenant", "platform"]),
  bank_account_id: z.string().uuid(),
  payer_name: z.string().min(1).max(120),
  payer_bank: z.string().min(1).max(120).optional().nullable(),
  transfer_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "transfer_date must be YYYY-MM-DD"),
  transfer_reference: z.string().min(1).max(80),
});

export type SubmitProofBody = z.infer<typeof SubmitProofSchema>;
