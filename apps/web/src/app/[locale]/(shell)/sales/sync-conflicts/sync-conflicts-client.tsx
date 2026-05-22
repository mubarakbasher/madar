"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth/store";
import {
  syncConflictResolveRequest,
  syncConflictsListRequest,
  type ApiSyncConflict,
  type SyncConflictStatus,
} from "@/lib/api/sync-conflicts";
import { ApiError } from "@/lib/api/client";

const TABS: SyncConflictStatus[] = ["open", "acknowledged", "resolved", "ignored"];
const RESOLVER_ROLES = new Set(["owner", "manager"]);

export function SyncConflictsClient({ locale: _locale }: { locale: string }): JSX.Element {
  const t = useTranslations("salesConflicts");
  const role = useAuthStore((s) => s.user?.role ?? "");
  const canResolve = RESOLVER_ROLES.has(role);
  const canRead = role === "owner" || role === "manager" || role === "auditor";

  const [status, setStatus] = useState<SyncConflictStatus>("open");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const listQ = useQuery({
    queryKey: ["sync-conflicts", "list", status],
    queryFn: () => syncConflictsListRequest({ status, limit: 100 }),
    enabled: canRead,
    staleTime: 30_000,
  });

  const items = listQ.data?.items ?? [];
  const selected: ApiSyncConflict | null = useMemo(() => {
    if (!selectedId) return items[0] ?? null;
    return items.find((c) => c.id === selectedId) ?? items[0] ?? null;
  }, [items, selectedId]);

  const resolveMut = useMutation({
    mutationFn: ({
      id,
      resolution_status,
      review_notes,
    }: {
      id: string;
      resolution_status: "acknowledged" | "resolved" | "ignored";
      review_notes: string | null;
    }) =>
      syncConflictResolveRequest(id, {
        resolution_status,
        review_notes,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sync-conflicts"] });
      setSelectedId(null);
    },
  });

  if (!canRead) {
    return (
      <section style={{ padding: "32px 24px", maxWidth: 720 }}>
        <span className="kicker">{t("kicker")}</span>
        <h1 className="serif" style={{ fontSize: 32, fontWeight: 500, marginBottom: 8 }}>
          {t("title")}
        </h1>
        <p style={{ color: "var(--ink-2)" }}>{t("errors.forbidden_role")}</p>
      </section>
    );
  }

  return (
    <section style={{ padding: "24px 24px 80px" }}>
      <header style={{ marginBottom: 16 }}>
        <span className="kicker">{t("kicker")}</span>
        <h1
          className="serif"
          style={{ fontSize: 32, fontWeight: 500, marginTop: 6, marginBottom: 4 }}
        >
          {t("title")}
        </h1>
        <p style={{ color: "var(--ink-2)", maxWidth: 720, fontSize: 14 }}>{t("subtitle")}</p>
      </header>

      <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
        {TABS.map((s) => (
          <button
            type="button"
            key={s}
            onClick={() => {
              setStatus(s);
              setSelectedId(null);
            }}
            aria-pressed={status === s}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid var(--rule)",
              background: status === s ? "var(--bg-elev)" : "transparent",
              color: status === s ? "var(--ink)" : "var(--ink-3)",
              fontWeight: status === s ? 500 : 400,
              cursor: "pointer",
              fontSize: 13,
              fontFamily: "inherit",
            }}
          >
            {t(`tabs.${s}`)}
          </button>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(300px, 380px) 1fr",
          gap: 16,
          minHeight: 480,
        }}
      >
        <aside
          style={{
            border: "1px solid var(--rule)",
            borderRadius: 12,
            background: "var(--bg-elev)",
            overflow: "hidden",
          }}
        >
          {listQ.isPending && (
            <div style={{ padding: 16, color: "var(--ink-3)" }}>{t("loading")}</div>
          )}
          {listQ.isError && (
            <div style={{ padding: 16 }}>
              <strong style={{ color: "var(--ink)" }}>{t("error.title")}</strong>
              <p style={{ color: "var(--ink-2)", margin: "6px 0 12px", fontSize: 13 }}>
                {t("error.body")}
              </p>
              <button
                type="button"
                className="pos-btn"
                onClick={() => void listQ.refetch()}
              >
                {t("error.retry")}
              </button>
            </div>
          )}
          {listQ.isSuccess && items.length === 0 && (
            <div style={{ padding: 24, textAlign: "center" }}>
              <h3 className="serif" style={{ fontSize: 18, fontWeight: 500 }}>
                {t("empty.title")}
              </h3>
              <p style={{ color: "var(--ink-3)", fontSize: 13, marginTop: 4 }}>
                {t("empty.body")}
              </p>
            </div>
          )}
          {items.map((c) => {
            const isSel = selected?.id === c.id;
            return (
              <button
                type="button"
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                aria-pressed={isSel}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  width: "100%",
                  textAlign: "start",
                  padding: "12px 14px",
                  border: 0,
                  borderTop: "1px solid var(--rule)",
                  background: isSel ? "var(--bg-sunk)" : "transparent",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  gap: 4,
                }}
              >
                <span
                  className="kicker"
                  style={{ color: "var(--ink-3)", fontSize: 11 }}
                >
                  {t(`kinds.${c.conflict_kind}`)}
                </span>
                <span style={{ fontSize: 13, color: "var(--ink)", fontFamily: "var(--mono, monospace)" }}>
                  {c.reference_id.slice(0, 8)}
                </span>
                <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                  {formatTime(c.occurred_at)}
                </span>
              </button>
            );
          })}
        </aside>

        <article
          style={{
            border: "1px solid var(--rule)",
            borderRadius: 12,
            background: "var(--bg-elev)",
            padding: 24,
            minHeight: 480,
          }}
        >
          {!selected && (
            <div style={{ color: "var(--ink-3)" }}>{t("empty.body")}</div>
          )}
          {selected && (
            <ConflictDetail
              conflict={selected}
              canResolve={canResolve}
              resolving={resolveMut.isPending}
              error={
                resolveMut.error instanceof ApiError
                  ? `${resolveMut.error.code}: ${resolveMut.error.message}`
                  : null
              }
              onSubmit={(resolution_status, review_notes) =>
                resolveMut.mutate({ id: selected.id, resolution_status, review_notes })
              }
            />
          )}
        </article>
      </div>
    </section>
  );
}

function ConflictDetail({
  conflict,
  canResolve,
  resolving,
  error,
  onSubmit,
}: {
  conflict: ApiSyncConflict;
  canResolve: boolean;
  resolving: boolean;
  error: string | null;
  onSubmit: (
    status: "acknowledged" | "resolved" | "ignored",
    notes: string | null,
  ) => void;
}): JSX.Element {
  const t = useTranslations("salesConflicts");
  const [notes, setNotes] = useState(conflict.review_notes ?? "");
  const isOpen = conflict.resolution_status === "open";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <span className="kicker">{t("detail.kindLabel")}</span>
        <h2
          className="serif"
          style={{ fontSize: 24, fontWeight: 500, marginTop: 4 }}
        >
          {t(`kinds.${conflict.conflict_kind}`)}
        </h2>
      </div>

      <div style={{ fontSize: 13, color: "var(--ink-2)" }}>
        <strong style={{ color: "var(--ink-3)" }}>{t("detail.occurredAtLabel")}: </strong>
        {formatTime(conflict.occurred_at)}
      </div>

      <div>
        <span className="kicker">{t("detail.detailsLabel")}</span>
        <pre
          style={{
            marginTop: 4,
            padding: 12,
            borderRadius: 8,
            background: "var(--bg-sunk)",
            color: "var(--ink-2)",
            fontSize: 12,
            overflowX: "auto",
            border: "1px solid var(--rule)",
          }}
        >
{JSON.stringify(conflict.details, null, 2)}
        </pre>
      </div>

      {conflict.reviewed_by_name && (
        <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
          {t("detail.reviewerLabel")}: <strong style={{ color: "var(--ink-2)" }}>{conflict.reviewed_by_name}</strong>
          {conflict.reviewed_at && <> · {formatTime(conflict.reviewed_at)}</>}
        </div>
      )}

      {isOpen && (
        <div>
          <label
            htmlFor="review-notes"
            style={{ fontSize: 12, color: "var(--ink-3)", display: "block", marginBottom: 4 }}
          >
            {t("detail.reviewLabel")}
          </label>
          <textarea
            id="review-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
            rows={4}
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 8,
              border: "1px solid var(--rule)",
              background: "var(--bg)",
              fontFamily: "inherit",
              fontSize: 13,
              resize: "vertical",
            }}
          />
        </div>
      )}

      {error && (
        <div
          role="alert"
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            background: "var(--rose-soft)",
            color: "var(--rose)",
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      {isOpen && canResolve && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className="pos-btn"
            disabled={resolving}
            onClick={() => onSubmit("acknowledged", notes.trim() || null)}
          >
            {t("actions.acknowledge")}
          </button>
          <button
            type="button"
            className="pos-btn pos-btn-primary"
            disabled={resolving}
            onClick={() => onSubmit("resolved", notes.trim() || null)}
          >
            {t("actions.resolve")}
          </button>
          <button
            type="button"
            className="pos-btn"
            disabled={resolving}
            onClick={() => onSubmit("ignored", notes.trim() || null)}
          >
            {t("actions.ignore")}
          </button>
        </div>
      )}
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString();
}
