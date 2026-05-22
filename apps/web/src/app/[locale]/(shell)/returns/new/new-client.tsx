"use client";

import { ReturnForm } from "../_components/ReturnForm";

/**
 * Entry point for creating a new supplier return. Single-page form — no
 * wizard. URL prefill is intentionally not honored (no upstream caller
 * routes here with prefill params yet); add when sidebar wiring lands.
 */
export function NewReturnClient({ locale }: { locale: "en" | "ar" }) {
  return <ReturnForm locale={locale} mode="new" />;
}
