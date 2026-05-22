import { z } from "zod";

export const AdminLoginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export type AdminLoginInput = z.infer<typeof AdminLoginSchema>;

export const MfaCodeSchema = z
  .string()
  .regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator");

export type MfaCodeInput = z.infer<typeof MfaCodeSchema>;
