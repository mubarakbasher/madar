import { z } from "zod";

export const VerifyEmailSchema = z.object({
  token: z.string().min(16).max(128),
});

export type VerifyEmailInput = z.infer<typeof VerifyEmailSchema>;

export const ResendVerificationSchema = z.object({
  email: z.string().email().max(255).transform((s) => s.toLowerCase()),
  locale: z.enum(["en", "ar"]).optional(),
});

export type ResendVerificationInput = z.infer<typeof ResendVerificationSchema>;
