import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { pickMessages } from "../../../lib/i18n/pick-messages";

/* Print-receipt route group — needs only the receipt namespace client-side. */
export default async function SalesReceiptLayout({
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
    <NextIntlClientProvider messages={pickMessages(messages, ["receipt", "common", "brand"])}>
      {children}
    </NextIntlClientProvider>
  );
}
