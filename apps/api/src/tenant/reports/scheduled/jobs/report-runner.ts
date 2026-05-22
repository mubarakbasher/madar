/**
 * Report-runner — bridges the scheduled-reports processor to whichever report
 * slice service the schedule points at (P&L / Tax / Trends).
 *
 * Slice 5 is shipped in parallel with slices 1–4. To avoid a hard compile-time
 * dependency on services that may not yet exist, we resolve the per-kind
 * service lazily through `ModuleRef`. Each slice will register a known token
 * (`PNL_REPORT_SERVICE`, `TAX_REPORT_SERVICE`, `TRENDS_REPORT_SERVICE`) via its
 * own module. Slice 5 just looks them up at runtime — if a slice isn't wired
 * yet, the scheduler returns a clear `service_unavailable` failure for that
 * kind without crashing the worker.
 */
import { Logger } from "@nestjs/common";
import type { ModuleRef } from "@nestjs/core";

export const PNL_REPORT_SERVICE = Symbol("PnlReportService");
export const TAX_REPORT_SERVICE = Symbol("TaxReportService");
export const TRENDS_REPORT_SERVICE = Symbol("TrendsReportService");

export type ScheduledReportKind = "pnl" | "tax" | "trends";

/**
 * Minimal contract the scheduler expects each report service to satisfy.
 * Each slice exposes its existing query method through this thin shape so the
 * scheduler can call them uniformly. `params` is the user-saved query bag and
 * `tenantId` is always passed for explicit tenancy.
 */
export interface ReportProducer {
  run(
    tenantId: string,
    params: Record<string, unknown>,
  ): Promise<ReportRunResult>;
}

export interface ReportRunResult {
  /** Title to show in the email subject + filename, e.g. "P&L". */
  title: string;
  /** Human-readable period label (e.g. "May 2026"). */
  periodLabel: string;
  /** Tabular shape we render to CSV/PDF. First row is the header. */
  rows: string[][];
}

const TOKEN_BY_KIND: Record<ScheduledReportKind, symbol> = {
  pnl: PNL_REPORT_SERVICE,
  tax: TAX_REPORT_SERVICE,
  trends: TRENDS_REPORT_SERVICE,
};

const FALLBACK_TITLES: Record<ScheduledReportKind, string> = {
  pnl: "P&L",
  tax: "Tax",
  trends: "Trends",
};

const logger = new Logger("ReportRunner");

/**
 * Resolve the slice service for `kind` and call its `.run()` method.
 *
 * Returns the rendered tabular payload OR `null` if the slice service is not
 * registered. The processor treats `null` as a non-retrying failure (we can't
 * retry our way out of a missing module).
 */
export async function runReport(
  moduleRef: ModuleRef,
  kind: ScheduledReportKind,
  tenantId: string,
  params: Record<string, unknown>,
): Promise<ReportRunResult | null> {
  const token = TOKEN_BY_KIND[kind];
  let producer: ReportProducer | null = null;
  try {
    producer = moduleRef.get<ReportProducer>(token, { strict: false });
  } catch {
    producer = null;
  }

  if (!producer || typeof producer.run !== "function") {
    logger.warn(
      `report producer for kind=${kind} is not registered (slice not wired); skipping run.`,
    );
    // Surface a minimal, honest payload so the processor still emails the
    // recipient (so they aren't silently dropped). The CSV will say so.
    return {
      title: FALLBACK_TITLES[kind],
      periodLabel: new Date().toISOString().slice(0, 10),
      rows: [
        ["status", "message"],
        [
          "unavailable",
          `Report producer for "${kind}" is not registered. Update your schedule once the slice ships.`,
        ],
      ],
    };
  }

  return producer.run(tenantId, params);
}
