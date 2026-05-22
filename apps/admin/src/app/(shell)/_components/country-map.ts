/**
 * Minimal ISO-3166-1 alpha-2 lookup for the tenants table. Covers the
 * countries we expect during 1.14a (MENA + a handful of common Western
 * markets). Full Intl.DisplayNames integration is over-scope for this slice.
 */
export const COUNTRY_MAP: Record<string, { flag: string; name: string }> = {
  EG: { flag: "🇪🇬", name: "Egypt" },
  SA: { flag: "🇸🇦", name: "Saudi Arabia" },
  AE: { flag: "🇦🇪", name: "United Arab Emirates" },
  KW: { flag: "🇰🇼", name: "Kuwait" },
  QA: { flag: "🇶🇦", name: "Qatar" },
  BH: { flag: "🇧🇭", name: "Bahrain" },
  OM: { flag: "🇴🇲", name: "Oman" },
  JO: { flag: "🇯🇴", name: "Jordan" },
  LB: { flag: "🇱🇧", name: "Lebanon" },
  MA: { flag: "🇲🇦", name: "Morocco" },
  TN: { flag: "🇹🇳", name: "Tunisia" },
  DZ: { flag: "🇩🇿", name: "Algeria" },
  TR: { flag: "🇹🇷", name: "Türkiye" },
  US: { flag: "🇺🇸", name: "United States" },
  GB: { flag: "🇬🇧", name: "United Kingdom" },
  DE: { flag: "🇩🇪", name: "Germany" },
  FR: { flag: "🇫🇷", name: "France" },
  ES: { flag: "🇪🇸", name: "Spain" },
  IT: { flag: "🇮🇹", name: "Italy" },
  NL: { flag: "🇳🇱", name: "Netherlands" },
  CA: { flag: "🇨🇦", name: "Canada" },
  AU: { flag: "🇦🇺", name: "Australia" },
};

export function countryName(code: string): string {
  return COUNTRY_MAP[code]?.name ?? code;
}

export function countryFlag(code: string): string {
  return COUNTRY_MAP[code]?.flag ?? "🏳️";
}
