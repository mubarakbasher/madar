import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { pickMessages } from "../../../lib/i18n/pick-messages";

/* POS is the tablet-critical route: its client provider carries only the
   namespaces the sell screen uses instead of the full dictionary. */
export default async function PosLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <NextIntlClientProvider messages={pickMessages(messages, ["pos", "common", "brand"])}>
      {children}
    </NextIntlClientProvider>
  );
}
