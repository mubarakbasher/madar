import type { ReactNode } from "react";
import { AdminSidebar } from "./AdminSidebar";
import { AdminTopbar } from "./AdminTopbar";

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="admin-app">
      <AdminSidebar />
      <AdminTopbar />
      <main className="admin-content">
        <div className="admin-content-inner">{children}</div>
      </main>
    </div>
  );
}
