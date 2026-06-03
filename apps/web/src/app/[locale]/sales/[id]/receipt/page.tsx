import { setRequestLocale } from "next-intl/server";
import { ReceiptDoc } from "./receipt-doc";
import { requireAuth } from "../../../../../lib/auth/server";

export const dynamic = "force-dynamic";

export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ size?: string }>;
}) {
  const { locale, id } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  // Receipt page calls protected endpoints — without this an unauthenticated
  // visitor sees a half-broken page instead of bouncing to /login.
  requireAuth(locale);
  const size = sp.size === "58mm" ? "58mm" : sp.size === "80mm" ? "80mm" : "a4";
  return <ReceiptDoc id={id} locale={locale === "ar" ? "ar" : "en"} size={size} />;
}
