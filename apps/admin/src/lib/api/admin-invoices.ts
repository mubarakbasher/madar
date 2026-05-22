import { adminApiFetch } from "./client";

export interface AdminInvoiceItem {
  id: string;
  reference_code: string;
  tenant: { id: string; slug: string; name: string };
  plan: { code: string; name: string };
  status: string;
  amount_cents: string;
  currency_code: string;
  period_start: string;
  period_end: string;
  due_date: string;
  paid_at: string | null;
  days_overdue: number;
}

export interface ListAdminInvoicesResponse {
  items: AdminInvoiceItem[];
  total: number;
  page: number;
  limit: number;
}

export function adminListInvoices(opts: {
  status?: string;
  currency?: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<ListAdminInvoicesResponse> {
  const q = new URLSearchParams();
  if (opts.status) q.set("status", opts.status);
  if (opts.currency) q.set("currency", opts.currency);
  if (opts.search) q.set("search", opts.search);
  if (opts.page) q.set("page", String(opts.page));
  if (opts.limit) q.set("limit", String(opts.limit));
  const qs = q.toString();
  return adminApiFetch<ListAdminInvoicesResponse>(`/v1/admin/invoices${qs ? `?${qs}` : ""}`);
}
