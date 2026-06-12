"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/store";
import {
  notificationsGetRequest,
  notificationsUpdateRequest,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENTS,
  type NotificationChannel,
  type NotificationEventType,
  type NotificationMatrix,
} from "@/lib/api/notifications";

export function NotificationsClient({ locale }: { locale: "en" | "ar" }) {
  void locale;
  const t = useTranslations("settings.notifications");
  const tErr = useTranslations("settings.notifications.errors");
  const role = useAuthStore((s) => s.user?.role ?? "");
  const canEdit = role === "owner" || role === "manager";
  const qc = useQueryClient();

  const [error, setError] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["notifications", "preferences"],
    queryFn: () => notificationsGetRequest(),
    staleTime: 30_000,
  });

  const m = useMutation({
    mutationFn: (
      body: Partial<Record<NotificationEventType, Partial<Record<NotificationChannel, boolean>>>>,
    ) => notificationsUpdateRequest(body),
    onSuccess: (data: NotificationMatrix) => {
      qc.setQueryData(["notifications", "preferences"], data);
      setError(null);
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) setError(err.message);
      else setError(tErr("network"));
    },
  });

  const toggle = (event: NotificationEventType, channel: NotificationChannel): void => {
    if (!canEdit || !q.data) return;
    const next = !q.data.preferences[event][channel];
    m.mutate({ [event]: { [channel]: next } } as Partial<
      Record<NotificationEventType, Partial<Record<NotificationChannel, boolean>>>
    >);
  };

  return (
    <div style={{ maxWidth: 720, padding: "var(--space-5) 0", display: "grid", gap: "var(--space-4)" }}>
      <header>
        <div
          style={{
            textTransform: "uppercase",
            letterSpacing: "0.16em",
            fontSize: 11,
            color: "var(--ink-3)",
          }}
        >
          {t("kicker")}
        </div>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 28,
            margin: "6px 0 0",
            color: "var(--ink-1)",
          }}
        >
          {t("title")}
        </h1>
        <p style={{ color: "var(--ink-3)", fontSize: 14, marginBlockStart: 6 }}>
          {t("subtitle")}
        </p>
      </header>

      {!canEdit && (
        <div
          style={{
            padding: "10px 14px",
            background: "color-mix(in oklab, var(--amber, #c08a2f) 12%, var(--surface-1))",
            border: "1px solid var(--line)",
            borderRadius: 8,
            color: "var(--ink-2)",
            fontSize: 13,
          }}
        >
          {tErr("forbidden_role")}
        </div>
      )}

      {error && (
        <div
          style={{
            padding: "10px 14px",
            background: "color-mix(in oklab, var(--rose) 10%, var(--surface-1))",
            border: "1px solid color-mix(in oklab, var(--rose) 30%, var(--line))",
            borderRadius: 8,
            color: "var(--rose)",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      <section
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--line)",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        {q.isPending ? (
          <div style={{ padding: 36, textAlign: "center", color: "var(--ink-3)" }}>
            {t("loading")}
          </div>
        ) : q.isError || !q.data ? (
          <div style={{ padding: 36, textAlign: "center", color: "var(--rose)" }}>
            {t("error")}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--surface-2)" }}>
                <th
                  style={{
                    textAlign: "start",
                    padding: "var(--space-3) var(--space-4)",
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "var(--ink-3)",
                    fontWeight: 500,
                  }}
                >
                  {t("col.event")}
                </th>
                {NOTIFICATION_CHANNELS.map((c) => (
                  <th
                    key={c}
                    style={{
                      width: 110,
                      padding: "var(--space-3) var(--space-4)",
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "var(--ink-3)",
                      fontWeight: 500,
                    }}
                  >
                    {t(`channel.${c}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {NOTIFICATION_EVENTS.map((event, i) => (
                <tr
                  key={event}
                  style={{ borderBlockStart: i === 0 ? "none" : "1px solid var(--line)" }}
                >
                  <td style={{ padding: "var(--space-3) var(--space-4)" }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink-1)" }}>
                      {t(`events.${event}.label`)}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--ink-3)", marginBlockStart: 2 }}>
                      {t(`events.${event}.description`)}
                    </div>
                  </td>
                  {NOTIFICATION_CHANNELS.map((c) => (
                    <td key={c} style={{ padding: "var(--space-3) var(--space-4)", textAlign: "center" }}>
                      <label style={{ display: "inline-block", cursor: canEdit ? "pointer" : "not-allowed" }}>
                        <input
                          type="checkbox"
                          checked={q.data.preferences[event][c]}
                          disabled={!canEdit || m.isPending}
                          onChange={() => toggle(event, c)}
                          style={{ width: 18, height: 18, accentColor: "var(--accent)" }}
                        />
                      </label>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
