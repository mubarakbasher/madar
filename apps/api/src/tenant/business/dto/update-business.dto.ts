import { z } from "zod";

export const BusinessTypeEnum = z.enum([
  "retail",
  "wholesale",
  "restaurant",
  "pharmacy",
  "services",
  "other",
]);
export type BusinessTypeValue = z.infer<typeof BusinessTypeEnum>;

export const UpdateBusinessSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    name_i18n: z
      .object({
        en: z.string().trim().min(1).max(120),
        ar: z.string().trim().min(1).max(120),
      })
      .optional(),
    legal_name: z.string().trim().max(200).nullable().optional(),
    business_type: BusinessTypeEnum.nullable().optional(),
    default_currency_code: z
      .string()
      .length(3)
      .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter ISO code")
      .optional(),
    timezone: z.string().trim().min(1).max(64).optional(),
    fiscal_year_start_month: z.number().int().min(1).max(12).optional(),
    tax_registration_number: z.string().trim().max(40).nullable().optional(),
    tax_inclusive_default: z.boolean().optional(),
    default_locale: z.enum(["en", "ar"]).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, {
    message: "Provide at least one field to update",
  });

export type UpdateBusinessInput = z.infer<typeof UpdateBusinessSchema>;
