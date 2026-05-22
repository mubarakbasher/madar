import { requireAdminAuth } from "@/lib/auth/server";
import { PlatformAuditClient } from "./platform-audit-client";

export default function PlatformAuditPage() {
  requireAdminAuth();
  return <PlatformAuditClient />;
}
