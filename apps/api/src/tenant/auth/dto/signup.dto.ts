import { z } from "zod";

export const SlugSchema = z
  .string()
  .min(3)
  .max(40)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Use lowercase letters, numbers, and single hyphens",
  );

export const PasswordSchema = z
  .string()
  .min(8, "At least 8 characters")
  .max(128)
  .refine((s) => /[A-Za-z]/.test(s) && /\d/.test(s), {
    message: "Include at least one letter and one digit",
  });

export const SignupSchema = z.object({
  business_name: z.string().min(2).max(120),
  slug: SlugSchema,
  owner_name: z.string().min(2).max(120),
  email: z.string().email().max(255).transform((s) => s.toLowerCase()),
  password: PasswordSchema,
  country_code: z.string().length(2).transform((s) => s.toUpperCase()),
  default_currency_code: z.string().length(3).transform((s) => s.toUpperCase()).optional(),
  default_locale: z.enum(["en", "ar"]).default("en"),
});

export type SignupInput = z.infer<typeof SignupSchema>;
