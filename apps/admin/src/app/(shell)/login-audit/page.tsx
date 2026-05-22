import { requireAdminAuth } from "@/lib/auth/server";
import { LoginAuditClient } from "./login-audit-client";

export default function LoginAuditPage() {
  requireAdminAuth();
  return <LoginAuditClient />;
}
