import { t } from "@/lib/i18n";

export default function Loading() {
  return (
    <div aria-busy="true">
      <div className="admin-skel" style={{ height: 44, width: 320, marginBottom: 24 }} />
      <div className="admin-skel" style={{ height: 34, marginBottom: 16 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="admin-skel" style={{ height: 44 }} />
        ))}
      </div>
      <span className="sr-only">{t("common.loading")}</span>
    </div>
  );
}
