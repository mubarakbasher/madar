import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_CORS_ORIGIN: z
    .string()
    .default("http://localhost:3000")
    .transform((s) => s.split(",").map((o) => o.trim()).filter(Boolean))
    .pipe(z.array(z.string().url()).min(1)),
  DATABASE_URL: z.string().min(1),
  DIRECT_DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).optional(),
  JWT_TENANT_SECRET: z.string().min(32),
  JWT_TENANT_ACCESS_TTL: z.string().default("15m"),
  JWT_TENANT_REFRESH_TTL: z.string().default("30d"),
  JWT_ADMIN_SECRET: z.string().min(32),
  JWT_ADMIN_ACCESS_TTL: z.string().default("8h"),
  JWT_ADMIN_REFRESH_TTL: z.string().default("8h"),
  JWT_ADMIN_MFA_PENDING_TTL: z.string().default("5m"),
  JWT_TENANT_MFA_PENDING_TTL: z.string().default("5m"),
  PASSWORD_RESET_TTL_HOURS: z.coerce.number().int().positive().default(1),
  EMAIL_VERIFICATION_TTL_HOURS: z.coerce.number().int().positive().default(24),
  COOKIE_DOMAIN: z.string().default("localhost"),
  STORAGE_ROOT: z.string().default(""),
  STORAGE_PROVIDER: z.enum(["local", "s3"]).default("local"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default("madar-receipts"),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z
    .union([z.string(), z.boolean()])
    .default("true")
    .transform((v) => v === true || v === "true"),
  EMAIL_PROVIDER: z.enum(["resend", "disk"]).default("disk"),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("Madar <hello@madar.dev>"),
  EMAIL_LOG_DIR: z.string().default("./var/sent-emails"),
  TENANT_WEB_ORIGIN: z.string().default("http://localhost:3000"),
  ADMIN_CRON_PATTERN: z.string().optional(),
  SENTRY_DSN_API: z.string().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("\n  - ");
    throw new Error(`Invalid environment configuration:\n  - ${issues}`);
  }
  cached = parsed.data;
  return cached;
}
