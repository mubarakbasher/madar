import "reflect-metadata";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { beforeAll, afterAll } from "vitest";

// Load env from the repo root .env. Vitest doesn't honor Node's --env-file
// flag, so we read and apply it manually before anything else evaluates it.
const dotenvPath = path.resolve(__dirname, "..", "..", "..", ".env");
if (fs.existsSync(dotenvPath)) {
  const content = fs.readFileSync(dotenvPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

// Tell the rate-limit guard + redis service we're in test mode.
process.env.NODE_ENV = "test";

// Use the in-memory Redis fallback for tests so we don't have to flush a real
// instance between specs. Refresh-jti storage and idempotency cache are
// per-process and predictable.
delete process.env.REDIS_URL;

// Pin storage to local-disk for tests — the makeStorageRoot helper overrides
// STORAGE_ROOT per spec to isolate uploads. S3 code path is exercised only by
// manual smoke against MinIO.
process.env.STORAGE_PROVIDER = "local";

// Pin email to disk-writer for tests; specs may override EMAIL_LOG_DIR per spec.
process.env.EMAIL_PROVIDER = "disk";
process.env.EMAIL_LOG_DIR = path.resolve(__dirname, "..", "var", "test-emails");

// BigInt JSON shim — same as production main.ts (in-process Nest tests don't
// run main.ts so we apply it here too).
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

// One-shot DB reset before any spec runs. migrate reset uses
// DIRECT_DATABASE_URL (the `madar` superuser) so the madar_app role + grants
// + RLS policies all come back the same as in prod.
beforeAll(async () => {
  execSync(
    "pnpm --filter=@madar/db exec prisma migrate reset --force --skip-seed --skip-generate",
    {
      cwd: path.resolve(__dirname, "..", "..", ".."),
      stdio: "inherit",
      env: { ...process.env, CI: "1" },
    },
  );
  // The signup flow looks up plan code "starter" — seed it once so signup
  // specs aren't gated on running pnpm db:seed beforehand.
  const { seedStarterPlan } = await import("./helpers/fixtures");
  await seedStarterPlan();
});

afterAll(async () => {
  const { basePrisma } = await import("@madar/db");
  await basePrisma.$disconnect();
});
