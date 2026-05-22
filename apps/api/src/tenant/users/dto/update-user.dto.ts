import { z } from "zod";

const ROLES = ["owner", "manager", "cashier", "accountant", "auditor"] as const;

// At least one of role / branch_id / is_active must be supplied. branch_id may
// be explicitly nulled to detach a user from a branch.
export const UpdateUserSchema = z
  .object({
    role: z.enum(ROLES).optional(),
    branch_id: z.string().uuid().nullable().optional(),
    is_active: z.boolean().optional(),
  })
  .refine(
    (d) =>
      d.role !== undefined || d.branch_id !== undefined || d.is_active !== undefined,
    { message: "At least one field must be provided" },
  );

export type UpdateUserBody = z.infer<typeof UpdateUserSchema>;
