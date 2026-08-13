import { z } from "zod";
import { i18nText } from "../../../shared/dto/i18n-text";

const I18N_NAME = i18nText(120);

const TAX_CODE = z
  .string()
  .trim()
  .toUpperCase()
  .min(2)
  .max(24)
  .regex(/^[A-Z0-9_-]+$/, "Code may only contain uppercase letters, digits, underscores, and dashes");

export const UpdateTaxClassSchema = z
  .object({
    code: TAX_CODE.optional(),
    name_i18n: I18N_NAME.optional(),
    rate_bps: z.coerce.number().int().min(0).max(100_000).optional(),
    is_active: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export type UpdateTaxClassBody = z.infer<typeof UpdateTaxClassSchema>;
