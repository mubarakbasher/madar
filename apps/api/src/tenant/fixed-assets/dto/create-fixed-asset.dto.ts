import { z } from "zod";

const I18N_NAME = z.object({
  en: z.string().trim().min(1).max(160),
  ar: z.string().trim().min(1).max(160),
});

const QUANTITY = z.coerce.number().int().min(0).max(1_000_000);
const NOTES = z.string().trim().max(500).optional().nullable();

export const CreateFixedAssetSchema = z.object({
  branch_id: z.string().uuid(),
  name_i18n: I18N_NAME,
  quantity: QUANTITY.default(0),
  notes: NOTES,
});

export type CreateFixedAssetBody = z.infer<typeof CreateFixedAssetSchema>;
