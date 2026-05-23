import { z } from "zod";

export const SelectPlanSchema = z.object({
  plan_id: z.string().uuid(),
});

export type SelectPlanInput = z.infer<typeof SelectPlanSchema>;
