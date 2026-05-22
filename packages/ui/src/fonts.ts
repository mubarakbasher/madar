import { Fraunces, Inter_Tight, JetBrains_Mono, IBM_Plex_Sans_Arabic } from "next/font/google";

// Display serif — editorial headings, totals, kickers
export const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-fraunces",
  axes: ["opsz"],
});

// Body sans — UI text, labels, body copy
export const interTight = Inter_Tight({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter-tight",
});

// Mono — codes, references, tabular data
export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains-mono",
});

// Arabic — body + headings when lang="ar"
export const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  variable: "--font-plex-arabic",
});

export const fontVariables = [
  fraunces.variable,
  interTight.variable,
  jetbrainsMono.variable,
  plexArabic.variable,
].join(" ");
