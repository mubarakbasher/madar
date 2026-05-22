import { z } from "zod";

export const UploadSupplierDocumentSchema = z.object({
  kind: z.enum(["contract", "tax_certificate", "bank_letter", "other"]),
  notes: z.string().trim().max(2000).optional(),
});

export type UploadSupplierDocumentBody = z.infer<typeof UploadSupplierDocumentSchema>;
