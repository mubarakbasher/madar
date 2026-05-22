import { setRequestLocale } from "next-intl/server";
import { PosClient } from "./pos-client";
import { requireAuth } from "../../../lib/auth/server";

export default async function PosPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  // POS lives outside the (shell) layout (full-screen cashier mode), so it
  // doesn't inherit that layout's `requireAuth`. Without this guard,
  // unauthenticated visitors see a useless "Failed to load products" error
  // when the catalog requests 401 — same fail-fast behavior as shell pages.
  requireAuth(locale);

  return <PosClient locale={locale === "ar" ? "ar" : "en"} />;
}
