import { z } from "zod";

export const SlugSchema = z
  .string()
  .min(3)
  .max(40)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "auth.signup.errors.slugInvalid",
  );

export const PasswordSchema = z
  .string()
  .min(8, "auth.signup.errors.weakPassword")
  .max(128)
  .refine((s) => /[A-Za-z]/.test(s) && /\d/.test(s), {
    message: "auth.signup.errors.weakPassword",
  });

export const LoginSchema = z.object({
  email: z.string().email("auth.login.errors.emailInvalid").transform((s) => s.toLowerCase().trim()),
  password: z.string().min(1, "auth.common.required"),
  remember: z.boolean().default(false),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const SignupSchema = z.object({
  business_name: z.string().min(2, "auth.common.required").max(120),
  slug: SlugSchema,
  owner_name: z.string().min(2, "auth.common.required").max(120),
  email: z.string().email("auth.login.errors.emailInvalid").transform((s) => s.toLowerCase().trim()),
  password: PasswordSchema,
  country_code: z.string().length(2),
  default_currency_code: z.string().length(3).default("USD"),
  default_locale: z.enum(["en", "ar"]).default("en"),
});
export type SignupInput = z.infer<typeof SignupSchema>;
