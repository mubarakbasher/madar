"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { MoreVertical, Plus } from "lucide-react";
import {
  type ApiScheduledReport,
  type CreateScheduledReportInput,
  type UpdateScheduledReportInput,
  createScheduledReportRequest,
  deleteScheduledReportRequest,
  listScheduledReportsRequest,
  runScheduledReportNowRequest,
  updateScheduledReportRequest,
} from "@/lib/api/reports/scheduled";
import { useAuthStore } from "@/lib/auth/store";
import { ApiError } from "@/lib/api/client";
import { ScheduledReportModal } from "./_components/ScheduledReportModal";
import "./scheduled.css";

const QUERY_KEY = ["scheduled-reports", "list"] as const;

type ModalState =
  | { open: false }
  | { open: true; mode: "create" }
  | { open: true; mode: "edit"; row: ApiScheduledReport };

export function ScheduledReportsClient({ locale: _locale }: { locale: "en" | "ar" }) {
  void _locale;
  const t = useTranslations("reports.scheduled");
  const role = useAuthStore((s) => s.user?.role ?? "");
  const canWrite = role === "owner" || role === "accountant";

  const qc = useQueryClient();
  const q = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => listScheduledReportsRequest(),
    staleTime: 30_000,
  });

  const [modal, setModal] = useState<ModalState>({ open: false });
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ApiScheduledReport | null>(null);

  const createMut = useMutation({
    mutationFn: (body: CreateScheduledReportInput) => createScheduledReportRequest(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
      setModal({ open: false });
      setFormError(null);
    },
    onError: (err: unknown) => {
      setFormError(getErrorMessage(err, t));
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateScheduledReportInput }) =>
      updateScheduledReportRequest(id, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
      setModal({ open: false });
      setFormError(null);
    },
    onError: (err: unknown) => {
      setFormError(getErrorMessage(err, t));
    },
  });

  const runMut = useMutation({
    mutationFn: (id: string) => runScheduledReportNowRequest(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteScheduledReportRequest(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
      setConfirmDelete(null);
    },
  });

  const items = useMemo(() => q.data?.items ?? [], [q.data]);

  if (q.isPending) {
    return (
      <div className="sch">
        <Header t={t} canWrite={canWrite} onNew={() => setModal({ open: true, mode: "create" })} />
        <div className="sch-skeleton">{t("loading")}</div>
      </div>
    );
  }

  if (q.isError) {
    return (
      <div className="sch">
        <Header t={t} canWrite={false} onNew={() => undefined} />
        <div className="sch-error">
          <h2>{t("error.title")}</h2>
          <p>{t("error.body")}</p>
          <button
            type="button"
            className="sch-btn sch-btn-primary"
            onClick={() => void q.refetch()}
          >
            {t("error.retry")}
          </button>
        </div>
      </div>
    );
  }

  const saving = createMut.isPending || updateMut.isPending;

  return (
    <div className="sch">
      <Header t={t} canWrite={canWrite} onNew={() => setModal({ open: true, mode: "create" })} />

      {items.length === 0 ? (
        <div className="sch-empty">
          <h2>{t("empty.title")}</h2>
          <p>{t("empty.body")}</p>
          {canWrite && (
            <button
              type="button"
              className="sch-btn sch-btn-primary"
              onClick={() => setModal({ open: true, mode: "create" })}
            >
              <Plus size={14} strokeWidth={1.5} /> {t("newSchedule")}
            </button>
          )}
        </div>
      ) : (
        <div className="sch-table-wrap">
          <table className="sch-table">
            <thead>
              <tr>
                <th>{t("columns.name")}</th>
                <th>{t("columns.kind")}</th>
                <th>{t("columns.cadence")}</th>
                <th>{t("columns.recipients")}</th>
                <th>{t("columns.lastRun")}</th>
                <th>{t("columns.active")}</th>
                <th aria-label={t("columns.actions")} />
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <Row
                  key={row.id}
                  row={row}
                  canWrite={canWrite}
                  onEdit={() => setModal({ open: true, mode: "edit", row })}
                  onRunNow={() => runMut.mutate(row.id)}
                  onToggle={() =>
                    updateMut.mutate({ id: row.id, body: { is_active: !row.is_active } })
                  }
                  onDelete={() => setConfirmDelete(row)}
                  t={t}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal.open && (
        <ScheduledReportModal
          mode={modal.mode}
          initial={modal.mode === "edit" ? modal.row : undefined}
          saving={saving}
          errorMessage={formError ?? undefined}
          onCancel={() => {
            setModal({ open: false });
            setFormError(null);
          }}
          onSubmit={(body) => {
            setFormError(null);
            if (modal.mode === "create") {
              createMut.mutate(body as CreateScheduledReportInput);
            } else {
              updateMut.mutate({
                id: modal.row.id,
                body: body as UpdateScheduledReportInput,
              });
            }
          }}
        />
      )}

      {confirmDelete && (
        <div
          className="sch-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setConfirmDelete(null)}
        >
          <div className="sch-confirm" onClick={(e) => e.stopPropagation()}>
            <h3>{t("deleteConfirm.title")}</h3>
            <p>{t("deleteConfirm.body")}</p>
            <div className="sch-confirm-actions">
              <button
                type="button"
                className="sch-btn sch-btn-ghost"
                onClick={() => setConfirmDelete(null)}
                disabled={deleteMut.isPending}
              >
                {t("deleteConfirm.cancel")}
              </button>
              <button
                type="button"
                className="sch-btn sch-btn-primary sch-btn-danger"
                onClick={() => deleteMut.mutate(confirmDelete.id)}
                disabled={deleteMut.isPending}
              >
                {t("deleteConfirm.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Header({
  t,
  canWrite,
  onNew,
}: {
  t: ReturnType<typeof useTranslations>;
  canWrite: boolean;
  onNew: () => void;
}) {
  return (
    <header className="sch-head">
      <div className="sch-head-text">
        <div className="sch-kicker">{t("kicker")}</div>
        <h1 className="sch-title">{t("title")}</h1>
        <p className="sch-subtitle">{t("subtitle")}</p>
      </div>
      {canWrite && (
        <button type="button" className="sch-btn sch-btn-primary" onClick={onNew}>
          <Plus size={14} strokeWidth={1.5} /> {t("newSchedule")}
        </button>
      )}
    </header>
  );
}

function Row({
  row,
  canWrite,
  onEdit,
  onRunNow,
  onToggle,
  onDelete,
  t,
}: {
  row: ApiScheduledReport;
  canWrite: boolean;
  onEdit: () => void;
  onRunNow: () => void;
  onToggle: () => void;
  onDelete: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const [kebabOpen, setKebabOpen] = useState(false);

  return (
    <tr>
      <td>
        <div className="sch-name">{row.name}</div>
        <div className="sch-name-sub">{row.format.toUpperCase()}</div>
      </td>
      <td>
        <span className="sch-chip sch-chip-kind">{t(`kinds.${row.report_kind}`)}</span>
      </td>
      <td>{t(`cadences.${row.cadence}`)}</td>
      <td>{renderRecipients(row.recipients)}</td>
      <td>{renderLastRun(row, t)}</td>
      <td>
        <label className="sch-toggle">
          <input
            type="checkbox"
            checked={row.is_active}
            disabled={!canWrite}
            onChange={onToggle}
          />
          <span className="sch-toggle-slider" />
        </label>
      </td>
      <td>
        {canWrite && (
          <div className="sch-kebab-wrap">
            <button
              type="button"
              className="sch-kebab-btn"
              aria-label={t("columns.actions")}
              onClick={() => setKebabOpen((v) => !v)}
            >
              <MoreVertical size={16} strokeWidth={1.5} />
            </button>
            {kebabOpen && (
              <div className="sch-kebab-menu" onMouseLeave={() => setKebabOpen(false)}>
                <button
                  type="button"
                  className="sch-kebab-item"
                  onClick={() => {
                    setKebabOpen(false);
                    onEdit();
                  }}
                >
                  {t("actions.edit")}
                </button>
                <button
                  type="button"
                  className="sch-kebab-item"
                  onClick={() => {
                    setKebabOpen(false);
                    onRunNow();
                  }}
                >
                  {t("actions.runNow")}
                </button>
                <button
                  type="button"
                  className="sch-kebab-item is-danger"
                  onClick={() => {
                    setKebabOpen(false);
                    onDelete();
                  }}
                >
                  {t("actions.delete")}
                </button>
              </div>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

function renderRecipients(recipients: string[]): string {
  if (recipients.length === 0) return "—";
  if (recipients.length === 1) return recipients[0]!;
  return `${recipients[0]} +${recipients.length - 1} more`;
}

function renderLastRun(
  row: ApiScheduledReport,
  t: ReturnType<typeof useTranslations>,
) {
  if (!row.last_run_at) {
    return <span className="sch-pill sch-pill-never">{t("status.never")}</span>;
  }
  const cls =
    row.last_status === "sent"
      ? "sch-pill-sent"
      : row.last_status === "failed"
        ? "sch-pill-failed"
        : "sch-pill-pending";
  const label = row.last_status ?? "pending";
  return (
    <>
      <span className={`sch-pill ${cls}`}>{t(`status.${label}`)}</span>
      <div className="sch-name-sub">{timeAgo(row.last_run_at)}</div>
    </>
  );
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diff = Date.now() - then;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function getErrorMessage(
  err: unknown,
  t: ReturnType<typeof useTranslations>,
): string {
  if (err instanceof ApiError) {
    if (err.code === "forbidden_role") return t("errors.forbidden_role");
    if (err.code === "validation_failed") return t("errors.validation_failed");
    return err.message;
  }
  return t("errors.generic");
}
