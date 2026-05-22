"use client";
import { apiFetch } from "./client";

export type StockMovementKind =
  | "sale"
  | "return_in"
  | "transfer_in"
  | "transfer_out"
  | "adjustment"
  | "receive"
  | "waste";

export type StockMovementReferenceTable =
  | "sales"
  | "sale_refunds"
  | "stock_transfers"
  | "purchase_orders"
  | "supplier_returns";

export interface ApiStockMovement {
  id: string;
  branch_id: string;
  branch_code: string;
  product_id: string;
  product_sku: string;
  product_name_en: string;
  product_name_i18n: { en: string; ar: string } | null;
  kind: StockMovementKind;
  qty_delta: number;
  unit_cost_cents: string | null;
  reference_table: string | null;
  reference_id: string | null;
  note: string | null;
  occurred_at: string;
  created_by: string | null;
  created_by_name: string | null;
}

export interface StockMovementsListResponse {
  items: ApiStockMovement[];
  total: number;
  page: number;
  limit: number;
}

export interface StockMovementsQuery {
  branch_id?: string;
  product_id?: string;
  kind?: StockMovementKind;
  reference_table?: StockMovementReferenceTable;
  created_by?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export function stockMovementsListRequest(
  q: StockMovementsQuery = {},
): Promise<StockMovementsListResponse> {
  const p = new URLSearchParams();
  if (q.branch_id) p.set("branch_id", q.branch_id);
  if (q.product_id) p.set("product_id", q.product_id);
  if (q.kind) p.set("kind", q.kind);
  if (q.reference_table) p.set("reference_table", q.reference_table);
  if (q.created_by) p.set("created_by", q.created_by);
  if (q.from) p.set("from", q.from);
  if (q.to) p.set("to", q.to);
  if (q.page) p.set("page", String(q.page));
  if (q.limit) p.set("limit", String(q.limit));
  const qs = p.toString();
  return apiFetch<StockMovementsListResponse>(
    `/v1/stock-movements${qs ? `?${qs}` : ""}`,
  );
}
