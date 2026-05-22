import { z } from "zod";

export const TENANT_STATUSES = [
  "trialing",
  "active",
  "grace_period",
  "suspended",
  "cancelled",
] as const;

export const ListTenantsQuerySchema = z.object({
  status: z.enum(TENANT_STATUSES).optional(),
  plan_code: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9_-]+$/i)
    .optional(),
  country_code: z
    .string()
    .length(2)
    .transform((s) => s.toUpperCase())
    .optional(),
  search: z.string().min(1).max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type ListTenantsQuery = z.infer<typeof ListTenantsQuerySchema>;
