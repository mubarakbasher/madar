import { z } from "zod";

export const CreateBankAccountSchema = z.object({
  bank_name: z.string().min(1).max(200),
  account_holder: z.string().min(1).max(200),
  account_number: z.string().min(4).max(34),
  iban: z.string().max(34).optional(),
  swift: z.string().max(11).optional(),
  currency_code: z.string().length(3).regex(/^[A-Z]{3}$/),
  country_code: z.string().length(2).regex(/^[A-Z]{2}$/),
  name_en: z.string().min(1).max(200).optional().default(""),
  notes_en: z.string().max(500).optional().default(""),
});

export const UpdateBankAccountSchema = CreateBankAccountSchema.partial().refine(
  (d) => Object.keys(d).length > 0,
  { message: "At least one field is required" },
);

export const ListBankAccountsQuerySchema = z.object({
  include_inactive: z
    .union([z.string(), z.boolean()])
    .default("false")
    .transform((v) => v === true || v === "true"),
});

export type CreateBankAccountInput = z.infer<typeof CreateBankAccountSchema>;
export type UpdateBankAccountInput = z.infer<typeof UpdateBankAccountSchema>;
export type ListBankAccountsQuery = z.infer<typeof ListBankAccountsQuerySchema>;
