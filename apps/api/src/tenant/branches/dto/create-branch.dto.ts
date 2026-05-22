import { z } from "zod";
import { OperatingHoursSchema, HolidaysSchema } from "./hours.dto";

const I18N_TEXT = z.object({
  en: z.string().trim().min(1).max(120),
  ar: z.string().trim().min(1).max(120),
});

const I18N_ADDRESS_OPTIONAL = z
  .object({
    en: z.string().trim().max(500).optional(),
    ar: z.string().trim().max(500).optional(),
  })
  .nullable()
  .optional();

const BRANCH_CODE = z
  .string()
  .trim()
  .toUpperCase()
  .min(2)
  .max(16)
  .regex(/^[A-Z0-9_-]+$/, "Code may only contain uppercase letters, digits, underscores, and dashes");

export const CreateBranchSchema = z.object({
  code: BRANCH_CODE,
  name_i18n: I18N_TEXT,
  address_i18n: I18N_ADDRESS_OPTIONAL,
  currency_code: z.string().length(3).toUpperCase().optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  opened_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "opened_at must be ISO date (YYYY-MM-DD)")
    .optional(),
  is_active: z.boolean().optional().default(true),
  operating_hours: OperatingHoursSchema.optional(),
  holidays: HolidaysSchema.optional(),
  geo_lat: z.number().min(-90).max(90).nullable().optional(),
  geo_lng: z.number().min(-180).max(180).nullable().optional(),
});

export type CreateBranchBody = z.infer<typeof CreateBranchSchema>;
