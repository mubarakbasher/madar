import Link from "next/link";
import { t } from "@/lib/i18n";

export default function NotFound() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="admin-error" role="alert">
        <p className="admin-error-title">{t("common.notFound.title")}</p>
        <p className="admin-error-body" style={{ marginBottom: 14 }}>
          {t("common.notFound.body")}
        </p>
        <Link href="/" className="admin-tb-action">
          {t("common.notFound.backHome")}
        </Link>
      </div>
    </main>
  );
}
