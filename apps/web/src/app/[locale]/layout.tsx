import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { DISPLAY_COOKIE, decodeDisplayPrefs, fontVariables } from "@madar/ui";
import { routing, type Locale } from "../../../i18n/routing";
import { QueryProvider } from "../../lib/query/provider";
import { AuthBootstrap } from "../../lib/auth/bootstrap";
import { pickMessages } from "../../lib/i18n/pick-messages";
import { FormatProvider } from "../../lib/i18n/format";
import { ThemeWatcher } from "../../lib/theme/theme";

/* Runs before first paint: resolves stored preference (madar_theme) or the
   OS setting onto <html data-theme> so a dark-preference user never sees a
   light flash. Mirrors lib/theme/theme.ts (keep in sync). */
const THEME_INIT = `(function(){try{var s=localStorage.getItem("madar_theme");var t=(s==="light"||s==="dark")?s:(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.setAttribute("data-theme",t);}catch(e){document.documentElement.setAttribute("data-theme","light");}})();`;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as Locale)) notFound();
  setRequestLocale(locale);

  const messages = await getMessages();
  const dir = locale === "ar" ? "rtl" : "ltr";
  // No tenant id to check against yet — the session isn't resolved server-side.
  // Worst case is one paint in the previous tenant's numerals on a shared
  // device; the store corrects it as soon as bootstrap returns.
  const displayPrefs = decodeDisplayPrefs(cookies().get(DISPLAY_COOKIE)?.value);

  return (
    <html
      lang={locale}
      dir={dir}
      data-accent="terracotta"
      className={fontVariables}
      suppressHydrationWarning
    >
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        {/* Root provider carries only what root-level client components
            (error boundary) need; each route group layers its own provider
            with its namespaces — (shell) passes the full dictionary. */}
        <NextIntlClientProvider messages={pickMessages(messages, ["common", "brand"])}>
          {/* Display preferences come from the tenants row, but the auth store
              is empty on first render — so the server resolves them from the
              madar_display cookie and FormatProvider uses that until bootstrap
              lands the real tenant. Same value on both sides, so no hydration
              mismatch and no flash of the wrong numeral system. */}
          <FormatProvider lang={locale === "ar" ? "ar" : "en"} initialPrefs={displayPrefs}>
            <QueryProvider>
              <ThemeWatcher />
              <AuthBootstrap>{children}</AuthBootstrap>
            </QueryProvider>
          </FormatProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
