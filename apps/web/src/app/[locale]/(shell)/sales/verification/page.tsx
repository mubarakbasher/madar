import { setRequestLocale } from "next-intl/server";
import { VerificationClient } from "./verification-client";

export default async function VerificationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <VerificationClient />;
}
