import { z } from "zod";

export const RequestInfoSchema = z.object({
  message: z.string().min(1).max(500),
});
export type RequestInfoInput = z.infer<typeof RequestInfoSchema>;
