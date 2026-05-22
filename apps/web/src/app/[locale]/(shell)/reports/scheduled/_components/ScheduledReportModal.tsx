"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import type {
  ApiScheduledReport,
  CreateScheduledReportInput,
  ScheduledReportCadence,
  ScheduledReportFormat,
  ScheduledReportKind,
  UpdateScheduledReportInput,
} from "@/lib/api/reports/scheduled";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ScheduledReportModalProps {
  mode: "create" | "edit";
  initial?: ApiScheduledReport;
  saving?: boolean;
  errorMessage?: string;
  onCancel: () => void;
  onSubmit: (
    body: CreateScheduledReportInput | UpdateScheduledReportInput,
  ) => void;
}

/**
 * Single modal handling create + edit. On `edit`, `report_kind` is read-only
 * (the API rejects changing it — the saved params shape is bound to a kind).
 */
export function ScheduledReportModal({
  mode,
  initial,
  saving,
  errorMessage,
  onCancel,
  onSubmit,
}: ScheduledReportModalProps) {
  const t = useTranslations("reports.scheduled");

  const [name, setName] = useState<string>(initial?.name ?? "");
  const [kind, setKind] = useState<ScheduledReportKind>(initial?.report_kind ?? "pnl");
  const [cadence, setCadence] = useState<ScheduledReportCadence>(initial?.cadence ?? "daily");
  const [format, setFormat] = useState<ScheduledReportFormat>(initial?.format ?? "csv");
  const [recipients, setRecipients] = useState<string[]>(initial?.recipients ?? []);
  const [recipientDraft, setRecipientDraft] = useState<string>("");
  const [params, setParams] = useState<Record<string, string>>(() => {
    const p = (initial?.params ?? {}) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const k of Object.keys(p)) {
      const v = p[k];
      if (typeof v === "string") out[k] = v;
      else if (typeof v === "number") out[k] = String(v);
    }
    return out;
  });
  const [emailError, setEmailError] = useState<string | null>(null);

  useEffect(() => {
    if (!initial) return;
    setName(initial.name);
    setKind(initial.report_kind);
    setCadence(initial.cadence);
    setFormat(initial.format);
    setRecipients(initial.recipients);
  }, [initial]);

  function commitDraft(): boolean {
    const draft = recipientDraft.trim().replace(/,$/, "");
    if (!draft) return true;
    const parts = draft.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
    const additions: string[] = [];
    for (const p of parts) {
      if (!EMAIL_RE.test(p)) {
        setEmailError(t("errors.invalid_email"));
        return false;
      }
      if (!recipients.includes(p) && !additions.includes(p)) additions.push(p);
    }
    if (additions.length > 0) {
      setRecipients((cur) => [...cur, ...additions]);
    }
    setRecipientDraft("");
    setEmailError(null);
    return true;
  }

  function removeRecipient(addr: string) {
    setRecipients((cur) => cur.filter((r) => r !== addr));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!commitDraft()) return;
    if (!name.trim() || name.trim().length < 2) return;
    if (recipients.length === 0) {
      setEmailError(t("errors.invalid_email"));
      return;
    }

    const paramsObj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(params)) {
      if (v != null && String(v).trim() !== "") paramsObj[k] = v;
    }

    if (mode === "create") {
      const body: CreateScheduledReportInput = {
        name: name.trim(),
        report_kind: kind,
        cadence,
        format,
        recipients,
        params: paramsObj,
      };
      onSubmit(body);
    } else {
      const body: UpdateScheduledReportInput = {
        name: name.trim(),
        cadence,
        format,
        recipients,
        params: paramsObj,
      };
      onSubmit(body);
    }
  }

  return (
    <div
      className="sch-modal-backdrop"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
    >
      <form
        className="sch-modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="sch-modal-head">
          <h2 className="sch-modal-title">
            {mode === "create" ? t("modal.create") : t("modal.edit")}
          </h2>
        </div>

        <div className="sch-modal-body">
          <label className="sch-field">
            <span className="sch-label">{t("modal.fields.name")}</span>
            <input
              type="text"
              className="sch-input"
              value={name}
              minLength={2}
              maxLength={120}
              required
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <label className="sch-field">
            <span className="sch-label">{t("modal.fields.kind")}</span>
            <select
              className="sch-select"
              value={kind}
              disabled={mode === "edit"}
              onChange={(e) => setKind(e.target.value as ScheduledReportKind)}
            >
              <option value="pnl">{t("kinds.pnl")}</option>
              <option value="tax">{t("kinds.tax")}</option>
              <option value="trends">{t("kinds.trends")}</option>
            </select>
          </label>

          <label className="sch-field">
            <span className="sch-label">{t("modal.fields.cadence")}</span>
            <select
              className="sch-select"
              value={cadence}
              onChange={(e) => setCadence(e.target.value as ScheduledReportCadence)}
            >
              <option value="daily">{t("cadences.daily")}</option>
              <option value="weekly">{t("cadences.weekly")}</option>
              <option value="monthly">{t("cadences.monthly")}</option>
            </select>
          </label>

          <div className="sch-field">
            <span className="sch-label">{t("modal.fields.recipients")}</span>
            <div className="sch-chip-input">
              {recipients.map((r) => (
                <span key={r} className="sch-recipient-chip">
                  {r}
                  <button
                    type="button"
                    aria-label="Remove"
                    onClick={() => removeRecipient(r)}
                  >
                    <X size={10} strokeWidth={1.5} />
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={recipientDraft}
                onChange={(e) => {
                  setEmailError(null);
                  setRecipientDraft(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    commitDraft();
                  } else if (e.key === "Backspace" && !recipientDraft && recipients.length) {
                    setRecipients((cur) => cur.slice(0, -1));
                  }
                }}
                onBlur={() => commitDraft()}
                placeholder="name@example.com"
              />
            </div>
            <span className="sch-hint">{t("modal.fields.recipientsHint")}</span>
            {emailError && <span className="sch-form-error">{emailError}</span>}
          </div>

          <div className="sch-field">
            <span className="sch-label">{t("modal.fields.format")}</span>
            <div className="sch-radio-row">
              <label className="sch-radio">
                <input
                  type="radio"
                  name="format"
                  value="csv"
                  checked={format === "csv"}
                  onChange={() => setFormat("csv")}
                />
                CSV
              </label>
              <label className="sch-radio">
                <input
                  type="radio"
                  name="format"
                  value="pdf"
                  checked={format === "pdf"}
                  onChange={() => setFormat("pdf")}
                />
                PDF
              </label>
            </div>
          </div>

          <ParamsBlock kind={kind} params={params} onChange={setParams} t={t} />

          {errorMessage && <div className="sch-form-error">{errorMessage}</div>}
        </div>

        <div className="sch-modal-foot">
          <button
            type="button"
            className="sch-btn sch-btn-ghost"
            onClick={onCancel}
            disabled={saving}
          >
            {t("modal.cancel")}
          </button>
          <button
            type="submit"
            className="sch-btn sch-btn-primary"
            disabled={saving}
          >
            {t("modal.submit")}
          </button>
        </div>
      </form>
    </div>
  );
}

function ParamsBlock({
  kind,
  params,
  onChange,
  t,
}: {
  kind: ScheduledReportKind;
  params: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  function set(key: string, value: string) {
    onChange({ ...params, [key]: value });
  }

  if (kind === "pnl" || kind === "tax") {
    return (
      <div className="sch-field">
        <span className="sch-label">{t("modal.fields.params")}</span>
        <label className="sch-field">
          <span className="sch-label">Currency</span>
          <input
            type="text"
            className="sch-input"
            placeholder="USD"
            maxLength={3}
            value={params.currency ?? ""}
            onChange={(e) => set("currency", e.target.value.toUpperCase())}
          />
        </label>
        <label className="sch-field">
          <span className="sch-label">Branch ID (optional)</span>
          <input
            type="text"
            className="sch-input"
            value={params.branch_id ?? ""}
            onChange={(e) => set("branch_id", e.target.value)}
          />
        </label>
      </div>
    );
  }

  // Trends
  return (
    <div className="sch-field">
      <span className="sch-label">{t("modal.fields.params")}</span>
      <label className="sch-field">
        <span className="sch-label">Metric</span>
        <select
          className="sch-select"
          value={params.metric ?? "revenue"}
          onChange={(e) => set("metric", e.target.value)}
        >
          <option value="revenue">revenue</option>
          <option value="transactions">transactions</option>
          <option value="gross_profit">gross_profit</option>
        </select>
      </label>
      <label className="sch-field">
        <span className="sch-label">Window (days)</span>
        <select
          className="sch-select"
          value={params.window ?? "30"}
          onChange={(e) => set("window", e.target.value)}
        >
          <option value="7">7</option>
          <option value="30">30</option>
          <option value="90">90</option>
        </select>
      </label>
      <label className="sch-field">
        <span className="sch-label">Currency</span>
        <input
          type="text"
          className="sch-input"
          placeholder="USD"
          maxLength={3}
          value={params.currency ?? ""}
          onChange={(e) => set("currency", e.target.value.toUpperCase())}
        />
      </label>
    </div>
  );
}
