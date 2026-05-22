import { z } from "zod";
import { PasswordSchema } from "./signup.dto";

export const ChangePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: PasswordSchema,
});

export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;
