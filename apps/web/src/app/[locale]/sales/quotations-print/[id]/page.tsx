import { setRequestLocale } from "next-intl/server";
import { requireAuth } from "../../../../../lib/auth/server";
import { QuotationPrintDoc } from "./quotation-print-doc";

export const dynamic = "force-dynamic";

/**
 * Chrome-free print route for a saved quotation — sibling of
 * sales/[id]/receipt/, deliberately kept OUTSIDE the (shell) route group so
 * no app chrome (sidebar/header) renders around the document. Reuses
 * sales/layout.tsx (receipt + common + brand messages only).
 */
export default async function QuotationPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ size?: string }>;
}) {
  const { locale, id } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  requireAuth(locale);
  const size = sp.size === "58mm" ? "58mm" : sp.size === "80mm" ? "80mm" : "a4";
  return <QuotationPrintDoc id={id} locale={locale === "ar" ? "ar" : "en"} size={size} />;
}
