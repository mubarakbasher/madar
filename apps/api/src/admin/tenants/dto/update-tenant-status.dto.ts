import { z } from "zod";

export const UpdateTenantStatusSchema = z.object({
  status: z.enum(["trialing", "active", "grace_period", "suspended", "cancelled"]),
  // Lifecycle overrides are flagged config edits — a typed reason is mandatory
  // (CLAUDE.md super-admin rule 6).
  reason: z.string().trim().min(10).max(500),
});

export type UpdateTenantStatusInput = z.infer<typeof UpdateTenantStatusSchema>;
