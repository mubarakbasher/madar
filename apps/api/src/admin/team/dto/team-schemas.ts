import { z } from "zod";

export const InviteMemberSchema = z.object({
  email: z.string().email().max(255),
  name: z.string().min(1).max(200),
  role: z.enum(["finance", "support", "developer", "readonly"]),
});

export const UpdateRoleSchema = z.object({
  role: z.enum(["finance", "support", "developer", "readonly"]),
});

export const AcceptInviteSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(12).max(128),
});

export type InviteMemberInput = z.infer<typeof InviteMemberSchema>;
export type UpdateRoleInput = z.infer<typeof UpdateRoleSchema>;
export type AcceptInviteInput = z.infer<typeof AcceptInviteSchema>;
