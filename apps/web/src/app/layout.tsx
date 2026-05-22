import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Madar",
  description: "Multi-branch point of sale for specialty retail.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Madar",
    statusBarStyle: "default",
  },
};

// Locale-aware <html> wrapping happens in [locale]/layout.tsx.
// This root layout exists only to satisfy Next.js's App Router contract.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
