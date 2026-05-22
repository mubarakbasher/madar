import type { Metadata } from "next";
import { fontVariables } from "@madar/ui";
import { QueryProvider } from "../lib/query/provider";
import { AdminAuthBootstrap } from "../lib/auth/bootstrap";
import "./globals.css";

export const metadata: Metadata = {
  title: "Madar Admin",
  description: "Super-admin console for the Madar platform.",
};

/**
 * The admin app is English-only and pins the slate-teal accent via
 * `class="theme-admin"`. `data-theme="light"` is the default; dark-mode
 * toggle ships with the dashboard slice (1.14).
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" className={`theme-admin ${fontVariables}`}>
      <body>
        <QueryProvider>
          <AdminAuthBootstrap>{children}</AdminAuthBootstrap>
        </QueryProvider>
      </body>
    </html>
  );
}
