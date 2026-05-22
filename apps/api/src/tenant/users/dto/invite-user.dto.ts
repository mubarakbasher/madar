import { z } from "zod";

// Mirrors enum TenantUserRole in packages/db/prisma/schema.prisma.
const ROLES = ["owner", "manager", "cashier", "accountant", "auditor"] as const;

export const InviteUserSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email()
    .max(254),
  name: z.string().trim().min(1).max(100),
  role: z.enum(ROLES),
  branch_id: z.string().uuid().nullable().optional(),
});

export type InviteUserBody = z.infer<typeof InviteUserSchema>;
