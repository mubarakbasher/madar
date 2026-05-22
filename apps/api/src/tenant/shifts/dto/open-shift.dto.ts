import { z } from "zod";

export const OpenShiftSchema = z.object({
  branch_id: z.string().uuid(),
  /** Opening float in minor units (cents). Non-negative integer. Accepts
   *  number or numeric string so JSON clients can pick either. */
  opening_float_cents: z
    .union([z.number().int(), z.string().regex(/^\d+$/)])
    .transform((v) => BigInt(v))
    .refine((v) => v >= 0n, { message: "opening_float_cents must be >= 0" }),
  /** Optional currency override; defaults to the branch currency. */
  currency_code: z.string().length(3).toUpperCase().optional(),
});

export type OpenShiftBody = z.infer<typeof OpenShiftSchema>;
