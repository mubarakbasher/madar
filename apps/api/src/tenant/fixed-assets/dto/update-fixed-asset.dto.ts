import { z } from "zod";
import { i18nText } from "../../../shared/dto/i18n-text";

const I18N_NAME = i18nText(160);

const QUANTITY = z.coerce.number().int().min(0).max(1_000_000);
const NOTES = z.string().trim().max(500).nullable();

export const UpdateFixedAssetSchema = z
  .object({
    branch_id: z.string().uuid().optional(),
    name_i18n: I18N_NAME.optional(),
    quantity: QUANTITY.optional(),
    notes: NOTES.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be set",
  });

export type UpdateFixedAssetBody = z.infer<typeof UpdateFixedAssetSchema>;
