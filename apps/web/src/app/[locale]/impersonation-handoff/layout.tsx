import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { pickMessages } from "../../../lib/i18n/pick-messages";

export default async function ImpersonationHandoffLayout({
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
    <NextIntlClientProvider
      messages={pickMessages(messages, ["impersonationHandoff", "common", "brand"])}
    >
      {children}
    </NextIntlClientProvider>
  );
}
