import { z } from "zod";

const NAME = z.string().trim().min(1).max(120);
const PHONE = z.string().trim().max(40).optional().nullable();
const EMAIL = z.string().trim().email().max(255).optional().nullable();
const NOTES = z.string().trim().max(2000).optional().nullable();
const CODE = z
  .string()
  .trim()
  .toUpperCase()
  .min(1)
  .max(32)
  .regex(/^[A-Z0-9_-]+$/, "code may only contain uppercase letters, digits, underscores, and dashes")
  .optional()
  .nullable();

export const CreateCustomerSchema = z.object({
  name: NAME,
  phone: PHONE,
  email: EMAIL,
  notes: NOTES,
  code: CODE,
});

export type CreateCustomerBody = z.infer<typeof CreateCustomerSchema>;
