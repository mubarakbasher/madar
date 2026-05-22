import { z } from "zod";

const NAME = z.string().trim().min(1).max(120);
const PHONE = z.string().trim().max(40).nullable();
const EMAIL = z.string().trim().email().max(255).nullable();
const NOTES = z.string().trim().max(2000).nullable();
const CODE = z
  .string()
  .trim()
  .toUpperCase()
  .min(1)
  .max(32)
  .regex(/^[A-Z0-9_-]+$/, "code may only contain uppercase letters, digits, underscores, and dashes")
  .nullable();

export const UpdateCustomerSchema = z
  .object({
    name: NAME.optional(),
    phone: PHONE.optional(),
    email: EMAIL.optional(),
    notes: NOTES.optional(),
    code: CODE.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be set",
  });

export type UpdateCustomerBody = z.infer<typeof UpdateCustomerSchema>;
