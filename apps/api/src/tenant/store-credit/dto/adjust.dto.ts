import { z } from "zod";

const I18N_NOTE = z.object({
  en: z.string().trim().min(1).max(500),
  ar: z.string().trim().min(1).max(500),
});

// Signed integer string ledger amount. We accept string on the wire to mirror
// the rest of the money columns and avoid JS number precision issues; the
// service coerces with BigInt(). Empty / non-numeric / fractional values fail
// here so the service can assume a clean BigInt-parseable value.
const SIGNED_AMOUNT = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^-?\d+$/, "amount_minor must be a signed integer string");

export const AdjustStoreCreditSchema = z.object({
  amount_minor: SIGNED_AMOUNT,
  currency_code: z.string().trim().toUpperCase().length(3).optional(),
  note_i18n: I18N_NOTE,
});

export type AdjustStoreCreditBody = z.infer<typeof AdjustStoreCreditSchema>;
