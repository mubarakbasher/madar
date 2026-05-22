import { z } from "zod";

// Manual stock adjustment kinds. We deliberately don't expose `sale`,
// `return_in`, `transfer_in`, `transfer_out`, or `receive` here — those
// movements must originate from their owning module so the surrounding state
// (sale, return, transfer, PO) stays consistent. Manual adjustments only cover
// counts that don't have a richer parent event.
export const ManualAdjustmentKinds = ["adjustment", "waste"] as const;

export const CreateAdjustmentSchema = z.object({
  branch_id: z.string().uuid(),
  product_id: z.string().uuid(),
  // The signed delta. Negative removes stock, positive adds. Zero is rejected
  // by the service (no-op adjustments are noise in the ledger).
  qty_delta: z.number().int().refine((n) => n !== 0, { message: "qty_delta must be non-zero" }),
  kind: z.enum(ManualAdjustmentKinds).default("adjustment"),
  // Free-text reason. Required so the auditor can read the ledger and
  // understand why a count moved without a sale/transfer.
  note: z.string().min(1).max(280),
  // Cost basis for the movement (cents in the tenant's currency). Optional;
  // only meaningful for waste/receive movements when COGS matters.
  unit_cost_cents: z.number().int().nonnegative().optional(),
});

export type CreateAdjustmentBody = z.infer<typeof CreateAdjustmentSchema>;
