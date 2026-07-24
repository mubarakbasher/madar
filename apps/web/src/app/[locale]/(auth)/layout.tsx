import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale, getTranslations } from "next-intl/server";
import { MadarMark } from "@madar/ui";
import { LocaleToggle } from "./_components/LocaleToggle";
import { pickMessages } from "../../../lib/i18n/pick-messages";

export default async function AuthLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const refresh = cookies().get("madar_refresh")?.value;
  if (refresh) {
    redirect(`/${locale}`);
  }
  const t = await getTranslations("auth");
  const tBrand = await getTranslations("brand");
  const messages = pickMessages(await getMessages(), ["auth", "brand", "common"]);

  return (
    <NextIntlClientProvider messages={messages}>
    <div
      className="min-h-dvh"
      style={{ background: "var(--bg)", color: "var(--ink)" }}
    >
      <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-[1fr_480px]">
        {/* Editorial left rail — hidden on small screens */}
        <aside
          className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in oklab, var(--accent) 18%, var(--bg)) 0%, var(--bg) 65%)",
          }}
          aria-hidden="true"
        >
          <div className="flex items-center gap-3">
            <MadarMark size={36} style={{ color: "var(--accent)" }} />
            <span style={{ fontFamily: "var(--serif)", fontSize: 22, letterSpacing: "-0.01em" }}>
              {tBrand("name")}
            </span>
          </div>

          <div>
            <h1
              style={{
                fontFamily: "var(--serif)",
                fontSize: "clamp(36px, 4.4vw, 60px)",
                lineHeight: 1.05,
                letterSpacing: "-0.02em",
                color: "var(--ink)",
              }}
            >
              {t("shell.brandHeadline")}
            </h1>
            <p
              className="mt-5 max-w-sm"
              style={{ color: "var(--ink-3)", fontSize: 15, lineHeight: 1.55 }}
            >
              {t("shell.brandTagline")}
            </p>
          </div>

          <div className="text-xs" style={{ color: "var(--ink-4)" }}>
            {t("shell.copyright")}
          </div>
        </aside>

        {/* Form panel */}
        <main
          className="flex flex-col"
          style={{ background: "var(--paper)" }}
        >
          <header className="flex items-center justify-between px-6 py-5 lg:px-10">
            <span
              className="inline-flex items-center gap-2 lg:hidden"
              style={{ fontFamily: "var(--serif)", fontSize: 20, letterSpacing: "-0.01em" }}
            >
              <MadarMark size={22} style={{ color: "var(--accent)" }} />
              {tBrand("name")}
            </span>
            <span className="hidden lg:block" />
            <LocaleToggle />
          </header>
          <div className="flex flex-1 items-center justify-center px-6 pb-12 lg:px-10">
            <div className="w-full max-w-[420px]">{children}</div>
          </div>
        </main>
      </div>
    </div>
    </NextIntlClientProvider>
  );
}
