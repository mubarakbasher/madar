import { z } from "zod";

export const EVENT_TYPES = [
  "low_stock",
  "trial_ending",
  "invoice_issued",
  "invoice_overdue",
  "payment_received",
  "payment_verified",
  "refund_completed",
  "shift_variance",
  "sync_failure",
] as const;

export const CHANNELS = ["email", "in_app"] as const;

export type NotificationEventType = (typeof EVENT_TYPES)[number];
export type NotificationChannel = (typeof CHANNELS)[number];

const ChannelPrefSchema = z
  .object({
    email: z.boolean().optional(),
    in_app: z.boolean().optional(),
  })
  .partial();

// Body shape: { [event_type]: { email?, in_app? } }
export const UpdatePreferencesSchema = z
  .object(
    Object.fromEntries(EVENT_TYPES.map((e) => [e, ChannelPrefSchema])) as Record<
      NotificationEventType,
      typeof ChannelPrefSchema
    >,
  )
  .partial()
  .refine((o) => Object.keys(o).length > 0, {
    message: "Provide at least one event_type",
  });

export type UpdatePreferencesInput = z.infer<typeof UpdatePreferencesSchema>;
