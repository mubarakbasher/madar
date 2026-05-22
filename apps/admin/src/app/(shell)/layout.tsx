import type { ReactNode } from "react";
import { requireAdminAuth } from "@/lib/auth/server";
import { AdminShell } from "./_components/AdminShell";
import "./admin-shell.css";

export default function ShellLayout({ children }: { children: ReactNode }) {
  requireAdminAuth();
  return <AdminShell>{children}</AdminShell>;
}
