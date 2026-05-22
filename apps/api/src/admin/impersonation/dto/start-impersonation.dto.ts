import { z } from "zod";

export const StartImpersonationSchema = z.object({
  user_id: z.string().uuid(),
  reason: z.string().trim().min(3).max(280),
});

export type StartImpersonationBody = z.infer<typeof StartImpersonationSchema>;
