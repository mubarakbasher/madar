import { z } from "zod";

export const CreateCategorySchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9-]+$/, "Category code may only contain lowercase letters, digits, and dashes"),
  name_i18n: z.object({
    en: z.string().trim().min(1).max(120),
    ar: z.string().trim().min(1).max(120),
  }),
  sort_order: z.coerce.number().int().min(0).max(10_000).optional(),
  parent_id: z.string().uuid().nullable().optional(),
});

export type CreateCategoryBody = z.infer<typeof CreateCategorySchema>;
