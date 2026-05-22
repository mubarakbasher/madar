import { z } from "zod";

const I18N_NAME = z.object({
  en: z.string().trim().min(1).max(160),
  ar: z.string().trim().min(1).max(160),
});

const I18N_ADDRESS_OPTIONAL = z
  .object({
    en: z.string().trim().max(500).optional(),
    ar: z.string().trim().max(500).optional(),
  })
  .nullable();

// `code` is immutable once set — not in the update schema by design.
export const UpdateSupplierSchema = z
  .object({
    name_i18n: I18N_NAME.optional(),
    country_code: z.string().trim().toUpperCase().length(2).nullable().optional(),
    currency_code: z.string().trim().toUpperCase().length(3).optional(),
    lead_time_days: z.coerce.number().int().min(0).max(3650).nullable().optional(),
    payment_terms: z.string().trim().max(120).nullable().optional(),
    contact_email: z.string().trim().email().max(254).nullable().optional(),
    contact_phone: z.string().trim().max(64).nullable().optional(),
    address_i18n: I18N_ADDRESS_OPTIONAL.optional(),
    tax_id: z.string().trim().max(64).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    is_active: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export type UpdateSupplierBody = z.infer<typeof UpdateSupplierSchema>;
