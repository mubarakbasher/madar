import { z } from "zod";

export const UpdateProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    locale: z.enum(["en", "ar"]).optional(),
  })
  .refine((o) => o.name !== undefined || o.locale !== undefined, {
    message: "Provide at least one field to update",
  });

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;
