import { z } from "zod";

/**
 * `/order` body — flips a draft PO to `ordered`. `send_email=true` will
 * additionally enqueue a job to email the supplier the PO PDF (only if the
 * supplier has a `contact_email`).
 */
export const OrderPurchaseOrderSchema = z.object({
  send_email: z.boolean().optional(),
});

export type OrderPurchaseOrderBody = z.infer<typeof OrderPurchaseOrderSchema>;
