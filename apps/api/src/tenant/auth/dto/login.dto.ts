import { z } from "zod";

export const LoginSchema = z.object({
  email: z.string().email().transform((s) => s.toLowerCase()),
  password: z.string().min(1),
  remember: z.boolean().default(false),
  tenant_slug: z.string().optional(),
});

export type LoginInput = z.infer<typeof LoginSchema>;
