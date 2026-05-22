import { z } from "zod";

export const MfaEnrollVerifySchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Must be a 6-digit TOTP code"),
});

export type MfaEnrollVerifyInput = z.infer<typeof MfaEnrollVerifySchema>;
