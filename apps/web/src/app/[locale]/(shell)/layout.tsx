import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { Shell } from "./_components/Shell";
import { SwBootstrap } from "../../../components/SwBootstrap";
import { requireAuth } from "../../../lib/auth/server";

export default async function ShellLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  requireAuth(locale);

  // The back-office shell touches nearly every namespace, so it gets the
  // full dictionary; leaner route groups (auth, POS, receipt) narrow theirs.
  const messages = await getMessages();

  return (
    <NextIntlClientProvider messages={messages}>
      <SwBootstrap />
      <Shell locale={locale}>{children}</Shell>
    </NextIntlClientProvider>
  );
}
