import { z } from "zod";

const ReceiveLine = z.object({
  line_id: z.string().uuid(),
  qty_received: z.coerce.number().int().min(0).max(1_000_000),
  discrepancy_note: z.string().max(500).nullable().optional(),
});

export const ReceiveTransferSchema = z.object({
  lines: z.array(ReceiveLine).min(1),
});

export type ReceiveTransferBody = z.infer<typeof ReceiveTransferSchema>;
