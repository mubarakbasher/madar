import { z } from "zod";

const I18N_TEXT = z.object({
  en: z.string().trim().min(1).max(200),
  ar: z.string().trim().min(1).max(200),
});

const I18N_TEXT_OPTIONAL = z
  .object({
    en: z.string().trim().max(2000).optional(),
    ar: z.string().trim().max(2000).optional(),
  })
  .nullable();

const SKU = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[A-Z0-9-]+$/, "SKU may only contain uppercase letters, digits, and dashes");

export const UpdateProductSchema = z
  .object({
    sku: SKU.optional(),
    name_i18n: I18N_TEXT.optional(),
    description_i18n: I18N_TEXT_OPTIONAL.optional(),
    category_id: z.string().uuid().nullable().optional(),
    tax_class_id: z.string().uuid().nullable().optional(),
    price_cents: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
    cost_cents: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
    currency_code: z.string().length(3).toUpperCase().optional(),
    barcode: z.string().trim().min(1).max(64).nullable().optional(),
    is_active: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export type UpdateProductBody = z.infer<typeof UpdateProductSchema>;
