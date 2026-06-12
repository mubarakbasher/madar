import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { ReloadButton } from "./_components/ReloadButton";

export default async function OfflinePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<JSX.Element> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "offline" });

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--space-5)",
        background: "var(--bg)",
      }}
    >
      <div
        style={{
          maxWidth: 480,
          padding: "var(--space-6) 28px",
          borderRadius: 16,
          background: "var(--bg-elev)",
          border: "1px solid var(--rule)",
          textAlign: "start",
        }}
      >
        <span className="kicker" style={{ color: "var(--ink-3)" }}>{t("title")}</span>
        <h1
          className="serif"
          style={{
            fontSize: 32,
            fontWeight: 500,
            marginTop: "var(--space-2)",
            marginBottom: "var(--space-3)",
            color: "var(--ink)",
            lineHeight: 1.15,
          }}
        >
          {t("title")}
        </h1>
        <p style={{ color: "var(--ink-2)", fontSize: 14.5, lineHeight: 1.6, marginBottom: 20 }}>
          {t("body")}
        </p>
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <ReloadButton label={t("reload")} />
          <Link
            href={`/${locale}/pos`}
            style={{
              padding: "10px var(--space-4)",
              borderRadius: 8,
              background: "var(--bg-sunk)",
              color: "var(--ink)",
              textDecoration: "none",
              fontSize: 14,
              border: "1px solid var(--rule)",
            }}
          >
            {t("goToPos")}
          </Link>
        </div>
      </div>
    </main>
  );
}
