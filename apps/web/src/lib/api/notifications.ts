"use client";
import { apiFetch } from "./client";

export type NotificationEventType =
  | "low_stock"
  | "trial_ending"
  | "invoice_issued"
  | "invoice_overdue"
  | "payment_received"
  | "payment_verified"
  | "refund_completed"
  | "shift_variance"
  | "sync_failure";

export type NotificationChannel = "email" | "in_app";

export const NOTIFICATION_EVENTS: NotificationEventType[] = [
  "low_stock",
  "trial_ending",
  "invoice_issued",
  "invoice_overdue",
  "payment_received",
  "payment_verified",
  "refund_completed",
  "shift_variance",
  "sync_failure",
];

export const NOTIFICATION_CHANNELS: NotificationChannel[] = ["email", "in_app"];

export interface NotificationMatrix {
  preferences: Record<NotificationEventType, Record<NotificationChannel, boolean>>;
}

export function notificationsGetRequest(): Promise<NotificationMatrix> {
  return apiFetch<NotificationMatrix>(`/v1/notifications/preferences`);
}

export function notificationsUpdateRequest(
  body: Partial<Record<NotificationEventType, Partial<Record<NotificationChannel, boolean>>>>,
): Promise<NotificationMatrix> {
  return apiFetch<NotificationMatrix>(`/v1/notifications/preferences`, {
    method: "PATCH",
    body,
  });
}
