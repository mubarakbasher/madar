"use client";
import { apiFetch } from "../client";

export type ScheduledReportKind = "pnl" | "tax" | "trends";
export type ScheduledReportCadence = "daily" | "weekly" | "monthly";
export type ScheduledReportFormat = "csv" | "pdf";
export type ScheduledReportStatus = "pending" | "sent" | "failed";

export interface ApiScheduledReport {
  id: string;
  name: string;
  report_kind: ScheduledReportKind;
  cadence: ScheduledReportCadence;
  cron_pattern: string;
  recipients: string[];
  format: ScheduledReportFormat;
  params: Record<string, unknown>;
  timezone: string;
  is_active: boolean;
  last_run_at: string | null;
  last_status: ScheduledReportStatus | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ListScheduledReportsResponse {
  items: ApiScheduledReport[];
  total: number;
}

export interface CreateScheduledReportInput {
  name: string;
  report_kind: ScheduledReportKind;
  cadence: ScheduledReportCadence;
  recipients: string[];
  format: ScheduledReportFormat;
  params?: Record<string, unknown>;
  timezone?: string;
}

export interface UpdateScheduledReportInput {
  name?: string;
  cadence?: ScheduledReportCadence;
  recipients?: string[];
  format?: ScheduledReportFormat;
  params?: Record<string, unknown>;
  timezone?: string;
  is_active?: boolean;
}

export function listScheduledReportsRequest(): Promise<ListScheduledReportsResponse> {
  return apiFetch<ListScheduledReportsResponse>("/v1/scheduled-reports");
}

export function createScheduledReportRequest(
  body: CreateScheduledReportInput,
): Promise<ApiScheduledReport> {
  return apiFetch<ApiScheduledReport>("/v1/scheduled-reports", {
    method: "POST",
    body,
  });
}

export function updateScheduledReportRequest(
  id: string,
  body: UpdateScheduledReportInput,
): Promise<ApiScheduledReport> {
  return apiFetch<ApiScheduledReport>(`/v1/scheduled-reports/${id}`, {
    method: "PATCH",
    body,
  });
}

export function runScheduledReportNowRequest(
  id: string,
): Promise<{ id: string; queued: true }> {
  return apiFetch<{ id: string; queued: true }>(
    `/v1/scheduled-reports/${id}/run-now`,
    { method: "POST" },
  );
}

export function deleteScheduledReportRequest(
  id: string,
): Promise<{ id: string; deleted_at: string }> {
  return apiFetch<{ id: string; deleted_at: string }>(
    `/v1/scheduled-reports/${id}`,
    { method: "DELETE" },
  );
}
