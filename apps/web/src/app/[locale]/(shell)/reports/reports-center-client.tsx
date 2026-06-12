"use client";

import { useTranslations } from "next-intl";
import {
  FileText,
  TrendingUp,
  PieChart,
  Receipt,
  CalendarClock,
  type LucideIcon,
} from "lucide-react";
import { Link } from "../../../../../i18n/routing";
import { useAuthStore } from "@/lib/auth/store";

const READER_ROLES = new Set(["owner", "manager", "accountant", "auditor"]);
const SCHEDULED_ROLES = new Set(["owner", "manager", "accountant"]);

interface ReportCard {
  id: "pnl" | "movers" | "trends" | "tax" | "scheduled";
  href: "/reports/pnl" | "/reports/movers" | "/reports/trends" | "/reports/tax" | "/reports/scheduled";
  icon: LucideIcon;
  rolesGate: Set<string>;
}

const CARDS: ReportCard[] = [
  { id: "pnl", href: "/reports/pnl", icon: FileText, rolesGate: READER_ROLES },
  { id: "movers", href: "/reports/movers", icon: PieChart, rolesGate: READER_ROLES },
  { id: "trends", href: "/reports/trends", icon: TrendingUp, rolesGate: READER_ROLES },
  { id: "tax", href: "/reports/tax", icon: Receipt, rolesGate: READER_ROLES },
  { id: "scheduled", href: "/reports/scheduled", icon: CalendarClock, rolesGate: SCHEDULED_ROLES },
];

export function ReportsCenterClient({ locale: _locale }: { locale: string }): JSX.Element {
  const t = useTranslations("reports.center");
  const role = useAuthStore((s) => s.user?.role ?? "");

  const visible = CARDS.filter((c) => c.rolesGate.has(role));

  if (!READER_ROLES.has(role)) {
    return (
      <section style={{ padding: "40px var(--space-5)", maxWidth: 640 }}>
        <span className="kicker">{t("kicker")}</span>
        <h1 className="serif" style={{ fontSize: 32, fontWeight: 500, marginTop: 6 }}>
          {t("title")}
        </h1>
        <p style={{ color: "var(--ink-2)", marginTop: "var(--space-2)" }}>
          {t("subtitle")}
        </p>
      </section>
    );
  }

  return (
    <section style={{ padding: "var(--space-6) var(--space-5) 80px", maxWidth: 1200 }}>
      <header style={{ marginBottom: "var(--space-5)", maxWidth: 720 }}>
        <span className="kicker">{t("kicker")}</span>
        <h1
          className="serif"
          style={{ fontSize: 36, fontWeight: 500, marginTop: 6, marginBottom: "var(--space-2)" }}
        >
          {t("title")}
        </h1>
        <p style={{ color: "var(--ink-2)", fontSize: 15, lineHeight: 1.55 }}>
          {t("subtitle")}
        </p>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: "var(--space-4)",
        }}
      >
        {visible.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.id}
              href={card.href}
              style={{
                display: "block",
                padding: 20,
                borderRadius: "var(--radius-lg)",
                background: "var(--bg-elev)",
                border: "1px solid var(--rule)",
                textDecoration: "none",
                color: "var(--ink)",
                transition: "transform 120ms ease, border-color 120ms ease",
              }}
            >
              <div
                aria-hidden
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: "var(--bg-sunk)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "var(--space-3)",
                  color: "var(--accent, var(--coral))",
                }}
              >
                <Icon size={18} strokeWidth={1.5} />
              </div>
              <h2
                className="serif"
                style={{ fontSize: 18, fontWeight: 500, marginBottom: 6 }}
              >
                {t(`cards.${card.id}.title`)}
              </h2>
              <p style={{ fontSize: 13, color: "var(--ink-3)", lineHeight: 1.5 }}>
                {t(`cards.${card.id}.body`)}
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
