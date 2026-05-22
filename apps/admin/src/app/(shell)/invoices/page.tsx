import { requireAdminAuth } from "@/lib/auth/server";
import { InvoicesClient } from "./invoices-client";

export default function InvoicesPage() {
  requireAdminAuth();
  return <InvoicesClient />;
}
