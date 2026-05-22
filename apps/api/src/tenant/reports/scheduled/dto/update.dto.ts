import { z } from "zod";
import { CreateScheduledReportSchema } from "./create.dto";

/**
 * PATCH body — every field is optional. `is_active` is the toggle that drives
 * BullMQ repeat-job (de)registration. `report_kind` is intentionally NOT
 * editable post-creation: switching kinds would invalidate the saved `params`
 * shape and there is no clean migration. Users delete + recreate instead.
 */
export const UpdateScheduledReportSchema = CreateScheduledReportSchema.partial()
  .extend({
    is_active: z.boolean().optional(),
  })
  .omit({ report_kind: true });

export type UpdateScheduledReportBody = z.infer<typeof UpdateScheduledReportSchema>;
