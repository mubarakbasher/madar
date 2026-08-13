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

export const CreateTaxClassSchema = z.object({
  code: TAX_CODE,
  name_i18n: I18N_NAME,
  // 0..100000 basis points → 0%..1000% (sane upper bound).
  rate_bps: z.coerce.number().int().min(0).max(100_000),
  is_active: z.boolean().optional().default(true),
});

export type CreateTaxClassBody = z.infer<typeof CreateTaxClassSchema>;
