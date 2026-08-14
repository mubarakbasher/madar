// Imported FIRST by seed/bootstrap scripts (before ../src/admin, whose
// adminPrisma constructs eagerly and requires ADMIN_DATABASE_URL).
import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";

// Load the repo-root .env. The Prisma CLI does this itself for migrate/reset,
// but `tsx prisma/seed.ts` does not — so `pnpm db:seed` died on
// "ADMIN_DATABASE_URL is required" on a clean shell. Doing it here covers
// db:seed, db:bootstrap-admin and the RLS tests from one place, and needs no
// Node >=20.6 `--env-file` support. Real environment variables always win.
loadDotenv({ path: resolve(__dirname, "../../../.env") });

// Derive the dev-convention madar_admin URL from DATABASE_URL when unset, so
// the documented two-URL dev setup keeps working.
if (!process.env.ADMIN_DATABASE_URL && process.env.DATABASE_URL) {
  process.env.ADMIN_DATABASE_URL = process.env.DATABASE_URL.replace(
    "madar_app:madar_app",
    "madar_admin:madar_admin",
  );
}
