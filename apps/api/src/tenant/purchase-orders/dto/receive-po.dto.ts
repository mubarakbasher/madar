import { z } from "zod";

const ReceiveLine = z.object({
  line_id: z.string().uuid(),
  qty_received: z.coerce.number().int().min(0).max(1_000_000),
  discrepancy_note: z.string().max(500).nullable().optional(),
});

export const ReceivePurchaseOrderSchema = z.object({
  lines: z.array(ReceiveLine).min(1).max(500),
});

export type ReceivePurchaseOrderBody = z.infer<typeof ReceivePurchaseOrderSchema>;
export type ReceivePurchaseOrderLine = z.infer<typeof ReceiveLine>;
