import type { Metadata } from "next";
import { fontVariables } from "@madar/ui";
import { QueryProvider } from "../lib/query/provider";
import { AdminAuthBootstrap } from "../lib/auth/bootstrap";
import "./globals.css";

export const metadata: Metadata = {
  title: "Madar Admin",
  description: "Super-admin console for the Madar platform.",
};

// Pre-paint theme resolution, mirroring apps/web's root layout — keep the two
// in sync. Previously the theme was only resolved by a useEffect inside the
// shell's topbar, so `data-theme="light"` was baked into the server HTML and
// the auth pages (/login, MFA, accept-invite) stayed light forever for
// dark-mode users, while the shell behind them flipped to dark after hydration.
// Storage key stays admin-specific: the two apps have separate toggles.
const THEME_INIT = `(function(){try{var s=localStorage.getItem("madar_admin_theme");var t=(s==="light"||s==="dark")?s:(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.setAttribute("data-theme",t);}catch(e){document.documentElement.setAttribute("data-theme","light");}})();`;

/**
 * The admin app is English-only and pins the slate-teal accent via
 * `class="theme-admin"`.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`theme-admin ${fontVariables}`} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <QueryProvider>
          <AdminAuthBootstrap>{children}</AdminAuthBootstrap>
        </QueryProvider>
      </body>
    </html>
  );
}
