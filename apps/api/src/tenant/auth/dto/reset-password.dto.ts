import { z } from "zod";
import { PasswordSchema } from "./signup.dto";

export const ResetPasswordSchema = z.object({
  token: z.string().min(16).max(128),
  new_password: PasswordSchema,
});

export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
