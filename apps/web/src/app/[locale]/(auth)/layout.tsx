import { setRequestLocale, getTranslations } from "next-intl/server";
import { LocaleToggle } from "./_components/LocaleToggle";

export default async function AuthLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");

  return (
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
            <div
              className="grid h-9 w-9 place-items-center rounded-lg text-white"
              style={{ background: "var(--accent)", fontFamily: "var(--serif)" }}
            >
              M
            </div>
            <span style={{ fontFamily: "var(--serif)", fontSize: 22, letterSpacing: "-0.01em" }}>
              Madar
            </span>
          </div>

          <div className="relative">
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

            {/* Quiet atmospheric card peeks */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -end-6 top-24 hidden rotate-[6deg] rounded-2xl border p-5 shadow-sm md:block"
              style={{
                width: 240,
                background: "var(--paper)",
                borderColor: "var(--rule)",
                boxShadow: "0 14px 40px -28px rgba(15,15,15,0.35)",
              }}
            >
              <div style={{ fontFamily: "var(--serif)", fontSize: 18 }}>كافيه بيت</div>
              <div className="mt-3" style={{ fontSize: 12, color: "var(--ink-3)" }}>
                Maadi · 5 branches · 21 SKUs
              </div>
            </div>
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
              className="lg:hidden"
              style={{ fontFamily: "var(--serif)", fontSize: 20, letterSpacing: "-0.01em" }}
            >
              Madar
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
  );
}
