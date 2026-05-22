import { z } from "zod";

export const MfaVerifySchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Code must be 6 digits"),
});

export type MfaVerifyInput = z.infer<typeof MfaVerifySchema>;
