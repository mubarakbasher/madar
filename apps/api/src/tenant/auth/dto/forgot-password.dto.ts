import { z } from "zod";

export const ForgotPasswordSchema = z.object({
  email: z.string().email().max(255).transform((s) => s.toLowerCase()),
  /**
   * Locale for the email link (en|ar). Falls back to the user's stored locale
   * if omitted so server-side defaults remain authoritative.
   */
  locale: z.enum(["en", "ar"]).optional(),
});

export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;
