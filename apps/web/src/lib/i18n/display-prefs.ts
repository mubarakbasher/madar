// Maps the tenant row's two booleans onto the shared DisplayPrefs shape.
//
// Kept separate from format.tsx so server components and the auth store can
// use it without pulling in React context.
import { DEFAULT_DISPLAY_PREFS, type DisplayPrefs } from "@madar/ui";
import type { AuthTenant } from "@/lib/auth/store";

type TenantPrefFields = Pick<AuthTenant, "use_arabic_indic_digits" | "use_hijri_calendar">;

export function prefsFromTenant(tenant: TenantPrefFields | null | undefined): DisplayPrefs {
  if (!tenant) return DEFAULT_DISPLAY_PREFS;
  return {
    numerals: tenant.use_arabic_indic_digits ? "arab" : "latn",
    calendar: tenant.use_hijri_calendar ? "islamic" : "gregory",
  };
}
