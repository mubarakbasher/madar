import { z } from "zod";

export const UpdateCategorySchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(/^[a-z0-9-]+$/, "Category code may only contain lowercase letters, digits, and dashes")
      .optional(),
    name_i18n: z
      .object({
        en: z.string().trim().min(1).max(120),
        ar: z.string().trim().min(1).max(120),
      })
      .optional(),
    sort_order: z.coerce.number().int().min(0).max(10_000).optional(),
    parent_id: z.string().uuid().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export type UpdateCategoryBody = z.infer<typeof UpdateCategorySchema>;
