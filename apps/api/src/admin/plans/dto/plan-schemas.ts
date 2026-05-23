import { z } from "zod";

const LIMIT = z
  .number()
  .int()
  .min(-1, "Use -1 for unlimited or a positive integer.")
  .refine((n) => n === -1 || n >= 0, "Limit must be -1 (unlimited) or non-negative.");

export const PlanLimitsSchema = z.object({
  txns: LIMIT,
  users: LIMIT,
  branches: LIMIT,
  storage_gb: LIMIT,
});

export const CreatePlanSchema = z.object({
  code: z
    .string()
    .min(2)
    .max(32)
    .regex(/^[a-z][a-z0-9_]+$/, "Lowercase letters, digits, and underscores only; must start with a letter."),
  name_en: z.string().min(1).max(80),
  name_ar: z.string().min(1).max(80),
  monthly_price_cents: z.number().int().min(0).max(10_000_000),
  currency_code: z.string().length(3).regex(/^[A-Z]{3}$/, "ISO 4217 three-letter code, uppercase."),
  limits: PlanLimitsSchema,
});

export const UpdatePlanSchema = CreatePlanSchema.omit({ code: true }).partial();

export const ListPlansQuerySchema = z.object({
  include_inactive: z.coerce.boolean().default(false),
});

export type CreatePlanInput = z.infer<typeof CreatePlanSchema>;
export type UpdatePlanInput = z.infer<typeof UpdatePlanSchema>;
export type ListPlansQuery = z.infer<typeof ListPlansQuerySchema>;
export type PlanLimits = z.infer<typeof PlanLimitsSchema>;
