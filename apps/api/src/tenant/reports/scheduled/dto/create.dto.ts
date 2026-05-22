import { z } from "zod";

export const CreateScheduledReportSchema = z.object({
  name: z.string().trim().min(2).max(120),
  report_kind: z.enum(["pnl", "tax", "trends"]),
  cadence: z.enum(["daily", "weekly", "monthly"]),
  recipients: z.array(z.string().email()).min(1).max(20),
  format: z.enum(["csv", "pdf"]),
  params: z.record(z.string(), z.unknown()).default({}),
  timezone: z.string().min(1).max(64).optional(),
});

export type CreateScheduledReportBody = z.infer<typeof CreateScheduledReportSchema>;
