import { z } from "zod";

// Accepts either a 6-digit TOTP code OR a recovery code (xxxx-xxxx, optional dash).
export const MfaVerifySchema = z.object({
  code: z
    .string()
    .trim()
    .min(6)
    .max(20)
    .transform((s) => s.toLowerCase()),
});

export type MfaVerifyInput = z.infer<typeof MfaVerifySchema>;
