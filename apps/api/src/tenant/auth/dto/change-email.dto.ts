import { z } from "zod";

export const ChangeEmailSchema = z.object({
  new_email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1),
});

export type ChangeEmailInput = z.infer<typeof ChangeEmailSchema>;
