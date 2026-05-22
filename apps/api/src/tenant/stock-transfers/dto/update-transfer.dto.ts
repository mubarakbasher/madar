import { z } from "zod";

const Line = z.object({
  product_id: z.string().uuid(),
  qty_sent: z.coerce.number().int().min(1).max(1_000_000),
});

export const UpdateTransferSchema = z
  .object({
    notes: z.string().max(2000).nullable().optional(),
    lines: z.array(Line).min(1).max(200).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "At least one field must be provided",
  });

export type UpdateTransferBody = z.infer<typeof UpdateTransferSchema>;
