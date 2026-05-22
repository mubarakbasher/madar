import { z } from "zod";
import { ManualAdjustmentKinds } from "./create-adjustment.dto";

// Read-side filter: a superset of manual + system-driven movement kinds so a
// manager can audit the full ledger.
const AllKinds = [
  ...ManualAdjustmentKinds,
  "sale",
  "return_in",
  "transfer_in",
  "transfer_out",
  "receive",
] as const;

const ReferenceTables = [
  "sales",
  "sale_refunds",
  "stock_transfers",
  "purchase_orders",
  "supplier_returns",
] as const;

export const ListMovementsQuerySchema = z.object({
  branch_id: z.string().uuid().optional(),
  product_id: z.string().uuid().optional(),
  kind: z.enum(AllKinds).optional(),
  reference_table: z.enum(ReferenceTables).optional(),
  created_by: z.string().uuid().optional(),
  from: z
    .string()
    .datetime({ offset: true })
    .optional()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD").optional()),
  to: z
    .string()
    .datetime({ offset: true })
    .optional()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD").optional()),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type ListMovementsQuery = z.infer<typeof ListMovementsQuerySchema>;
