import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from "@nestjs/common";
// `OnApplicationBootstrap` re-registers repeat jobs across every active
// schedule in EVERY tenant; the lookup must bypass RLS because there's no
// per-request tenant context yet. Per-request reads continue to use
// `tenantScoped`.
// eslint-disable-next-line no-restricted-imports
import { adminPrisma, tenantScoped } from "@madar/db";
import { AuditService, type AuditCtx } from "../../auth/audit.service";
import type { CreateScheduledReportBody } from "./dto/create.dto";
import type { UpdateScheduledReportBody } from "./dto/update.dto";
import { ScheduledReportQueue } from "./jobs/queue";
import { CADENCE_CRON } from "./jobs/types";

const READER_ROLES = new Set(["owner", "manager", "accountant"]);
const WRITER_ROLES = new Set(["owner", "accountant"]);

export interface ApiScheduledReport {
  id: string;
  name: string;
  report_kind: "pnl" | "tax" | "trends";
  cadence: "daily" | "weekly" | "monthly";
  cron_pattern: string;
  recipients: string[];
  format: "csv" | "pdf";
  params: Record<string, unknown>;
  timezone: string;
  is_active: boolean;
  last_run_at: string | null;
  last_status: "pending" | "sent" | "failed" | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ListScheduledReportsResponse {
  items: ApiScheduledReport[];
  total: number;
}

@Injectable()
export class ScheduledReportsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ScheduledReportsService.name);

  constructor(
    private readonly audit: AuditService,
    private readonly queue: ScheduledReportQueue,
  ) {}

  // ─── bootstrap ──────────────────────────────────────────────────────

  /**
   * On boot, walk every active schedule (across all tenants) and register a
   * BullMQ repeat job for it. Without Redis this is a no-op + a single
   * warning per schedule; with Redis the cron repeats are restored after a
   * deploy/restart.
   */
  async onApplicationBootstrap(): Promise<void> {
    if (!this.queue.hasQueue) {
      this.logger.warn(
        "No BullMQ queue wired — scheduled-report cron repeats are disabled. Manual `Run now` still works.",
      );
      return;
    }
    try {
      const rows = await adminPrisma.scheduledReport.findMany({
        where: { is_active: true, deleted_at: null },
        select: {
          id: true,
          tenant_id: true,
          cron_pattern: true,
          timezone: true,
        },
      });
      for (const r of rows) {
        await this.queue.registerRepeat({
          scheduleId: r.id,
          tenantId: r.tenant_id,
          cronPattern: r.cron_pattern,
          timezone: r.timezone,
        });
      }
      this.logger.log(`Registered ${rows.length} scheduled-report repeat job(s).`);
    } catch (err) {
      this.logger.warn(
        `bootstrap of scheduled-report repeats failed: ${(err as Error).message}`,
      );
    }
  }

  // ─── role gates ─────────────────────────────────────────────────────

  assertCanRead(role: string): void {
    if (!READER_ROLES.has(role)) {
      throw new ForbiddenException({
        code: "forbidden_role",
        message: "You do not have permission to read scheduled reports",
      });
    }
  }

  assertCanWrite(role: string): void {
    if (!WRITER_ROLES.has(role)) {
      throw new ForbiddenException({
        code: "forbidden_role",
        message: "Only owners and accountants can manage scheduled reports",
      });
    }
  }

  // ─── helpers ───────────────────────────────────────────────────────

  private toApi(row: {
    id: string;
    name: string;
    report_kind: string;
    cadence: string;
    cron_pattern: string;
    recipients: unknown;
    format: string;
    params: unknown;
    timezone: string;
    is_active: boolean;
    last_run_at: Date | null;
    last_status: string | null;
    last_error: string | null;
    created_at: Date;
    updated_at: Date;
  }): ApiScheduledReport {
    return {
      id: row.id,
      name: row.name,
      report_kind: row.report_kind as "pnl" | "tax" | "trends",
      cadence: row.cadence as "daily" | "weekly" | "monthly",
      cron_pattern: row.cron_pattern,
      recipients: Array.isArray(row.recipients)
        ? (row.recipients as unknown[]).filter((v): v is string => typeof v === "string")
        : [],
      format: row.format as "csv" | "pdf",
      params: (row.params as Record<string, unknown>) ?? {},
      timezone: row.timezone,
      is_active: row.is_active,
      last_run_at: row.last_run_at ? row.last_run_at.toISOString() : null,
      last_status:
        row.last_status === "pending" || row.last_status === "sent" || row.last_status === "failed"
          ? row.last_status
          : null,
      last_error: row.last_error,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  }

  private async loadOr404(tenantId: string, id: string) {
    const row = await tenantScoped(tenantId).scheduledReport.findUnique({ where: { id } });
    if (!row || row.deleted_at) {
      throw new NotFoundException({
        code: "scheduled_report_not_found",
        message: "Scheduled report not found",
      });
    }
    return row;
  }

  // ─── reads ─────────────────────────────────────────────────────────

  async list(tenantId: string): Promise<ListScheduledReportsResponse> {
    const scoped = tenantScoped(tenantId);
    const [rows, total] = await Promise.all([
      scoped.scheduledReport.findMany({
        where: { deleted_at: null },
        orderBy: { created_at: "desc" },
      }),
      scoped.scheduledReport.count({ where: { deleted_at: null } }),
    ]);
    return {
      items: rows.map((r) => this.toApi(r)),
      total,
    };
  }

  async getOne(tenantId: string, id: string): Promise<ApiScheduledReport> {
    const row = await this.loadOr404(tenantId, id);
    return this.toApi(row);
  }

  // ─── mutations ─────────────────────────────────────────────────────

  async create(
    tenantId: string,
    actorId: string,
    body: CreateScheduledReportBody,
    ctx: AuditCtx,
  ): Promise<ApiScheduledReport> {
    const scoped = tenantScoped(tenantId);
    const cron = CADENCE_CRON[body.cadence];
    const timezone = body.timezone ?? "Africa/Cairo";

    const created = await scoped.scheduledReport.create({
      data: {
        tenant_id: tenantId,
        name: body.name,
        report_kind: body.report_kind,
        cadence: body.cadence,
        cron_pattern: cron,
        params: body.params as object,
        recipients: body.recipients as unknown as object,
        format: body.format,
        timezone,
        is_active: true,
        created_by: actorId,
      },
    });

    // Register the BullMQ cron repeat. No-op when Redis is missing.
    await this.queue.registerRepeat({
      scheduleId: created.id,
      tenantId,
      cronPattern: cron,
      timezone,
    });

    await this.audit
      .writeTenantScoped(ctx, {
        action: "scheduled_report_created",
        entity: "scheduled_report",
        entityId: created.id,
        after: {
          name: created.name,
          report_kind: created.report_kind,
          cadence: created.cadence,
          cron_pattern: created.cron_pattern,
          recipients_count: body.recipients.length,
          format: created.format,
        },
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return this.toApi(created);
  }

  async update(
    tenantId: string,
    id: string,
    body: UpdateScheduledReportBody,
    ctx: AuditCtx,
  ): Promise<ApiScheduledReport> {
    const existing = await this.loadOr404(tenantId, id);
    const scoped = tenantScoped(tenantId);

    const data: Record<string, unknown> = {};
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};

    if (body.name !== undefined && body.name !== existing.name) {
      data.name = body.name;
      before.name = existing.name;
      after.name = body.name;
    }
    if (body.cadence !== undefined && body.cadence !== existing.cadence) {
      data.cadence = body.cadence;
      data.cron_pattern = CADENCE_CRON[body.cadence];
      before.cadence = existing.cadence;
      after.cadence = body.cadence;
    }
    if (body.params !== undefined) {
      data.params = body.params as object;
      before.params = existing.params;
      after.params = body.params;
    }
    if (body.recipients !== undefined) {
      data.recipients = body.recipients as unknown as object;
      before.recipients_count = Array.isArray(existing.recipients) ? (existing.recipients as unknown[]).length : 0;
      after.recipients_count = body.recipients.length;
    }
    if (body.format !== undefined && body.format !== existing.format) {
      data.format = body.format;
      before.format = existing.format;
      after.format = body.format;
    }
    if (body.timezone !== undefined && body.timezone !== existing.timezone) {
      data.timezone = body.timezone;
      before.timezone = existing.timezone;
      after.timezone = body.timezone;
    }
    if (body.is_active !== undefined && body.is_active !== existing.is_active) {
      data.is_active = body.is_active;
      before.is_active = existing.is_active;
      after.is_active = body.is_active;
    }

    if (Object.keys(data).length === 0) {
      return this.toApi(existing);
    }

    const updated = await scoped.scheduledReport.update({ where: { id }, data });

    // Sync the BullMQ repeat job to match the new state.
    const cronChanged =
      body.cadence !== undefined && body.cadence !== existing.cadence;
    const tzChanged = body.timezone !== undefined && body.timezone !== existing.timezone;
    const activeChanged =
      body.is_active !== undefined && body.is_active !== existing.is_active;
    if (activeChanged || cronChanged || tzChanged) {
      if (updated.is_active) {
        await this.queue.registerRepeat({
          scheduleId: updated.id,
          tenantId,
          cronPattern: updated.cron_pattern,
          timezone: updated.timezone,
        });
      } else {
        await this.queue.unregisterRepeat(updated.id);
      }
    }

    await this.audit
      .writeTenantScoped(ctx, {
        action: "scheduled_report_updated",
        entity: "scheduled_report",
        entityId: id,
        before,
        after,
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return this.toApi(updated);
  }

  async softDelete(
    tenantId: string,
    id: string,
    ctx: AuditCtx,
  ): Promise<{ id: string; deleted_at: string }> {
    const existing = await this.loadOr404(tenantId, id);
    const scoped = tenantScoped(tenantId);
    const now = new Date();
    await scoped.scheduledReport.update({
      where: { id },
      data: { deleted_at: now, is_active: false },
    });
    await this.queue.unregisterRepeat(id);

    await this.audit
      .writeTenantScoped(ctx, {
        action: "scheduled_report_deleted",
        entity: "scheduled_report",
        entityId: id,
        before: { name: existing.name, report_kind: existing.report_kind },
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return { id, deleted_at: now.toISOString() };
  }

  /**
   * Enqueue a `Run now` job and return immediately. The processor handles
   * the actual send + status update. Audit row records the manual fire
   * regardless of outcome.
   */
  async runNow(
    tenantId: string,
    id: string,
    actorId: string,
    ctx: AuditCtx,
  ): Promise<{ id: string; queued: true }> {
    await this.loadOr404(tenantId, id);

    await this.queue.enqueueRunNow({
      tenantId,
      scheduleId: id,
      triggeredByUserId: actorId,
      manual: true,
    });

    await this.audit
      .writeTenantScoped(ctx, {
        action: "scheduled_report_fired_manually",
        entity: "scheduled_report",
        entityId: id,
        after: { triggered_by: actorId },
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return { id, queued: true };
  }
}
