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
  .nullable()
  .optional();

const SUPPLIER_CODE = z
  .string()
  .trim()
  .toUpperCase()
  .min(2)
  .max(16)
  .regex(/^[A-Z0-9_-]+$/, "Code may only contain uppercase letters, digits, underscores, and dashes");

export const CreateSupplierSchema = z.object({
  code: SUPPLIER_CODE,
  name_i18n: I18N_NAME,
  country_code: z.string().trim().toUpperCase().length(2).optional(),
  currency_code: z.string().trim().toUpperCase().length(3).optional(),
  lead_time_days: z.coerce.number().int().min(0).max(3650).optional(),
  payment_terms: z.string().trim().max(120).optional(),
  contact_email: z.string().trim().email().max(254).optional(),
  contact_phone: z.string().trim().max(64).optional(),
  address_i18n: I18N_ADDRESS_OPTIONAL,
  tax_id: z.string().trim().max(64).optional(),
  notes: z.string().trim().max(2000).optional(),
  is_active: z.boolean().optional().default(true),
});

export type CreateSupplierBody = z.infer<typeof CreateSupplierSchema>;
