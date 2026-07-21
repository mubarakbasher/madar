import { useTranslations } from "next-intl";
import { Compass } from "lucide-react";
import { Link } from "../../../i18n/routing";

export default function NotFound() {
  const t = useTranslations("common.notFound");

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "var(--space-5)" }}>
      <div style={{ textAlign: "center" }}>
        <Compass
          size={40}
          strokeWidth={1.5}
          aria-hidden="true"
          style={{ color: "var(--ink-4)", marginBlockEnd: "var(--space-4)" }}
        />
        <h1 className="serif" style={{ fontSize: 26, margin: 0, marginBlockEnd: "var(--space-2)" }}>
          {t("title")}
        </h1>
        <p style={{ color: "var(--ink-3)", maxWidth: 420, marginInline: "auto", marginBlockEnd: "var(--space-5)" }}>
          {t("body")}
        </p>
        <Link href="/" className="btn btn-primary">
          {t("backHome")}
        </Link>
      </div>
    </main>
  );
}
