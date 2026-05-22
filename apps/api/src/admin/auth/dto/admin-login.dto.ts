import { z } from "zod";

export const AdminLoginSchema = z.object({
  email: z.string().email().transform((s) => s.toLowerCase().trim()),
  password: z.string().min(1),
});

export type AdminLoginInput = z.infer<typeof AdminLoginSchema>;
