import { z } from "zod";

export const MfaDisableSchema = z.object({
  password: z.string().min(1).max(128),
});

export type MfaDisableInput = z.infer<typeof MfaDisableSchema>;
