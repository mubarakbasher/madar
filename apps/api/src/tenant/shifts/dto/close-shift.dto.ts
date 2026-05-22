import { z } from "zod";

export const CloseShiftSchema = z.object({
  /** Cash actually counted at end-of-shift, minor units. Required. */
  declared_closing_cash_cents: z
    .union([z.number().int(), z.string().regex(/^\d+$/)])
    .transform((v) => BigInt(v))
    .refine((v) => v >= 0n, { message: "declared_closing_cash_cents must be >= 0" }),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export type CloseShiftBody = z.infer<typeof CloseShiftSchema>;
