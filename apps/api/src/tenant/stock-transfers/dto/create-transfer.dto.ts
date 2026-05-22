import { z } from "zod";

const Line = z.object({
  product_id: z.string().uuid(),
  qty_sent: z.coerce.number().int().min(1).max(1_000_000),
});

export const CreateTransferSchema = z
  .object({
    from_branch_id: z.string().uuid(),
    to_branch_id: z.string().uuid(),
    notes: z.string().max(2000).optional(),
    lines: z.array(Line).min(1).max(200),
  })
  .refine((d) => d.from_branch_id !== d.to_branch_id, {
    message: "from_branch_id and to_branch_id must differ",
    path: ["to_branch_id"],
  });

export type CreateTransferBody = z.infer<typeof CreateTransferSchema>;
