/**
 * Scheduled-reports BullMQ processor.
 *
 * Driven both by `Run now` (one-off enqueue) and by repeat cron jobs registered
 * at bootstrap (see `queue.ts`). Identical execution path; the only
 * difference is the audit action recorded.
 *
 * Why `adminPrisma`: the job runs outside any tenant request context, so the
 * usual `app.current_tenant_id` GUC is unset. We treat `payload.tenantId` as
 * the authoritative scope, verify the schedule row's `tenant_id` matches, and
 * filter every secondary query by it.
 *
 * Error handling: missing schedule, mismatched tenant → log + return without
 * throwing (no point retrying a deleted row). Genuine transient errors
 * (DB/email outage) bubble so BullMQ's retry policy can do its thing.
 */
import { Injectable, Logger } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
// Job runs outside any tenant request context — adminPrisma is required to
// reach the row whose tenant we're about to honour explicitly.
// eslint-disable-next-line no-restricted-imports
import { adminPrisma } from "@madar/db";
import { EmailService } from "../../../../common/email/email.service";
import { AuditService } from "../../../auth/audit.service";
import { renderCsv, renderPdf } from "./renderer";
import { runReport, type ScheduledReportKind } from "./report-runner";
import {
  SCHEDULED_REPORT_QUEUE,
  SCHEDULED_REPORT_RUN_ONCE,
  type ScheduledReportJobPayload,
} from "./types";

@Injectable()
@Processor(SCHEDULED_REPORT_QUEUE)
export class ScheduledReportProcessor extends WorkerHost {
  private readonly logger = new Logger(ScheduledReportProcessor.name);

  constructor(
    private readonly email: EmailService,
    private readonly audit: AuditService,
    private readonly moduleRef: ModuleRef,
  ) {
    super();
  }

  async process(
    job: Job<ScheduledReportJobPayload>,
  ): Promise<{ id?: string; sent: number } | { skipped: true; reason: string }> {
    return runScheduledReportJob(this.email, this.audit, this.moduleRef, job.data);
  }
}

/**
 * Pure execution path — used both by the BullMQ worker and by the inline
 * fallback path when Redis is unavailable. Returns either `{ sent, id }` or
 * `{ skipped, reason }`; throws only on transient errors that should retry.
 */
export async function runScheduledReportJob(
  email: EmailService,
  audit: AuditService,
  moduleRef: ModuleRef,
  payload: ScheduledReportJobPayload,
): Promise<{ id?: string; sent: number } | { skipped: true; reason: string }> {
  const logger = new Logger("ScheduledReportJob");

  const row = await adminPrisma.scheduledReport.findFirst({
    where: { id: payload.scheduleId, deleted_at: null },
  });
  if (!row) {
    logger.warn(`schedule ${payload.scheduleId} not found / deleted; skipping.`);
    return { skipped: true, reason: "schedule_not_found" };
  }
  if (row.tenant_id !== payload.tenantId) {
    logger.warn(
      `schedule ${payload.scheduleId} tenant mismatch (row=${row.tenant_id}, payload=${payload.tenantId}); skipping.`,
    );
    return { skipped: true, reason: "tenant_mismatch" };
  }
  if (!row.is_active) {
    logger.debug(`schedule ${payload.scheduleId} is inactive; skipping fire.`);
    return { skipped: true, reason: "inactive" };
  }

  // Hydrate tenant for the email body.
  const tenant = await adminPrisma.tenant.findUnique({
    where: { id: row.tenant_id },
    select: { name: true, name_i18n: true },
  });
  const tenantName = pickEn(tenant?.name_i18n, tenant?.name ?? "Madar tenant");

  const recipients = parseRecipients(row.recipients);
  if (recipients.length === 0) {
    logger.warn(`schedule ${row.id} has no recipients; skipping.`);
    await markStatus(row.id, "failed", "No recipients configured");
    return { skipped: true, reason: "no_recipients" };
  }

  let report;
  try {
    report = await runReport(
      moduleRef,
      row.report_kind as ScheduledReportKind,
      row.tenant_id,
      (row.params as Record<string, unknown>) ?? {},
    );
  } catch (err) {
    logger.error(
      `report generation failed for schedule ${row.id}: ${(err as Error).message}`,
    );
    await markStatus(row.id, "failed", (err as Error).message.slice(0, 500));
    throw err; // transient → let BullMQ retry
  }

  if (!report) {
    await markStatus(row.id, "failed", "Report service unavailable");
    return { skipped: true, reason: "report_service_unavailable" };
  }

  const filename = `${sanitizeForFilename(row.name)}.${row.format}`;
  const contentType = row.format === "pdf" ? "application/pdf" : "text/csv; charset=utf-8";
  let content: Buffer;
  try {
    if (row.format === "pdf") {
      content = await renderPdf(report);
    } else {
      content = Buffer.from(renderCsv(report), "utf8");
    }
  } catch (err) {
    logger.error(`render failed for schedule ${row.id}: ${(err as Error).message}`);
    await markStatus(row.id, "failed", (err as Error).message.slice(0, 500));
    throw err;
  }

  const subject = `Madar — ${report.title} for ${report.periodLabel}`;
  const html = buildHtml(report.title, report.periodLabel, tenantName, row.format);
  const text = buildText(report.title, report.periodLabel, tenantName, row.format);

  let lastId: string | undefined;
  let sent = 0;
  const errors: string[] = [];
  for (const to of recipients) {
    try {
      const { id } = await email.sendRaw({
        to,
        subject,
        html,
        text,
        tag: `scheduled-report-${sanitizeForFilename(row.report_kind)}`,
        attachments: [{ filename, content, contentType }],
      });
      lastId = id;
      sent += 1;
    } catch (err) {
      const msg = `${to}: ${(err as Error).message}`;
      logger.warn(`email send failed for schedule ${row.id} → ${msg}`);
      errors.push(msg);
    }
  }

  const status = errors.length === 0 ? "sent" : sent === 0 ? "failed" : "sent";
  await markStatus(row.id, status, errors.length ? errors.join("; ").slice(0, 500) : null);

  await audit
    .writeTenantScoped(
      {
        tenantId: row.tenant_id,
        userId: payload.triggeredByUserId ?? null,
        ip: "0.0.0.0",
        userAgent: payload.manual ? "scheduler/manual" : "scheduler/cron",
      },
      {
        action: "scheduled_report_fired",
        entity: "scheduled_report",
        entityId: row.id,
        after: {
          recipients: recipients.length,
          sent,
          format: row.format,
          kind: row.report_kind,
          manual: !!payload.manual,
          status,
        },
      },
    )
    .catch((e) => logger.warn(`audit write failed: ${(e as Error).message}`));

  logger.log(
    `scheduled report fired: id=${row.id} kind=${row.report_kind} sent=${sent}/${recipients.length} format=${row.format}`,
  );
  return { id: lastId, sent };
}

// ─── helpers ─────────────────────────────────────────────────────────

async function markStatus(
  id: string,
  status: "pending" | "sent" | "failed",
  error: string | null,
): Promise<void> {
  await adminPrisma.scheduledReport.update({
    where: { id },
    data: {
      last_run_at: new Date(),
      last_status: status,
      last_error: error,
    },
  });
}

function parseRecipients(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((v): v is string => typeof v === "string")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function pickEn(value: unknown, fallback: string): string {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if (typeof obj.en === "string" && obj.en.trim()) return obj.en;
    if (typeof obj.ar === "string" && obj.ar.trim()) return obj.ar;
  }
  if (typeof value === "string" && value.trim()) return value;
  return fallback;
}

function sanitizeForFilename(s: string): string {
  return s.replace(/[^a-z0-9._-]/gi, "_").slice(0, 80) || "report";
}

function buildHtml(
  reportName: string,
  periodLabel: string,
  tenantName: string,
  format: "csv" | "pdf",
): string {
  const fmt = format.toUpperCase();
  return `<!doctype html>
<html lang="en" dir="ltr">
<body style="font-family: -apple-system, system-ui, sans-serif; color: #1A1714; max-width: 560px; margin: 0 auto; padding: 24px;">
  <h1 style="font-family: Fraunces, Georgia, serif; font-size: 22px; margin: 0 0 8px;">${escapeHtml(reportName)}</h1>
  <p style="margin: 0 0 16px; color: #5C564D;">${escapeHtml(periodLabel)}</p>
  <p style="margin: 0 0 16px;">Hi,</p>
  <p style="margin: 0 0 16px;">Your scheduled <strong>${escapeHtml(reportName)}</strong> for <strong>${escapeHtml(periodLabel)}</strong> is attached as a ${escapeHtml(fmt)} file.</p>
  <p style="margin: 0 0 16px;">Sent by Madar on behalf of <strong>${escapeHtml(tenantName)}</strong>.</p>
  <hr style="border: none; border-top: 1px solid #E8E4DD; margin: 32px 0;" />
  <p style="font-size: 11px; color: #8A8478;">Sent automatically by Madar POS.</p>
</body>
</html>`;
}

function buildText(
  reportName: string,
  periodLabel: string,
  tenantName: string,
  format: "csv" | "pdf",
): string {
  return [
    `${reportName} — ${periodLabel}`,
    "",
    `Hi,`,
    "",
    `Your scheduled ${reportName} for ${periodLabel} is attached as a ${format.toUpperCase()} file.`,
    "",
    `Sent by Madar on behalf of ${tenantName}.`,
  ].join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Re-export so the BullMQ wiring file (queue.ts) can register the worker without
// a circular import.
export { SCHEDULED_REPORT_QUEUE, SCHEDULED_REPORT_RUN_ONCE };
