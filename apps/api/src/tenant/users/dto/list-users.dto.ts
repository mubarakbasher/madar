import { z } from "zod";

export const ListUsersQuerySchema = z.object({
  search: z.string().trim().min(1).max(120).optional(),
  active_only: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((v) =>
      v === true || v === "true" ? true : v === false || v === "false" ? false : undefined,
    ),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type ListUsersQuery = z.infer<typeof ListUsersQuerySchema>;
