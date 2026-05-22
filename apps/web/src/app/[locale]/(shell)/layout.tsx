import { setRequestLocale } from "next-intl/server";
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

  return (
    <>
      <SwBootstrap />
      <Shell locale={locale}>{children}</Shell>
    </>
  );
}
