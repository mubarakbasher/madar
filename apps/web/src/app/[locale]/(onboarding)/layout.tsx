import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { MadarMark } from "@madar/ui";
import { requireAuth } from "../../../lib/auth/server";
import { pickMessages } from "../../../lib/i18n/pick-messages";

/**
 * Minimal layout for the post-signup onboarding step. requireAuth gate +
 * a clean centered canvas. No sidebar / topbar — the tenant hasn't unlocked
 * the rest of the app yet; the only goal here is picking a plan.
 */
export default async function OnboardingLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  requireAuth(locale);
  const tBrand = await getTranslations("brand");
  const messages = pickMessages(await getMessages(), ["onboarding", "brand", "common"]);

  return (
    <NextIntlClientProvider messages={messages}>
    <div
      className="min-h-dvh"
      style={{ background: "var(--bg)", color: "var(--ink)" }}
    >
      <header
        className="flex items-center justify-between px-6 py-5 lg:px-10"
        style={{ borderBottom: "1px solid var(--rule)" }}
      >
        <div className="flex items-center gap-3">
          <MadarMark size={32} style={{ color: "var(--accent)" }} />
          <span
            style={{ fontFamily: "var(--serif)", fontSize: 20, letterSpacing: "-0.01em" }}
          >
            {tBrand("name")}
          </span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[920px] px-6 py-12 lg:px-10">
        {children}
      </main>
    </div>
    </NextIntlClientProvider>
  );
}
