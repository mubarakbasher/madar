import { z } from "zod";

export const MfaRegenerateSchema = z.object({
  password: z.string().min(1).max(128),
});

export type MfaRegenerateInput = z.infer<typeof MfaRegenerateSchema>;
