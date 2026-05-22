import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { fontVariables } from "@madar/ui";
import { routing, type Locale } from "../../../i18n/routing";
import { QueryProvider } from "../../lib/query/provider";
import { AuthBootstrap } from "../../lib/auth/bootstrap";

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

  return (
    <html lang={locale} dir={dir} data-theme="light" data-accent="terracotta" className={fontVariables}>
      <body>
        <NextIntlClientProvider messages={messages}>
          <QueryProvider>
            <AuthBootstrap>{children}</AuthBootstrap>
          </QueryProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
