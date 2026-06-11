// Runs BEFORE test/setup.ts (setupFiles order) and imports nothing from src/.
// adminPrisma constructs eagerly at import time and requires
// ADMIN_DATABASE_URL — derive the dev-convention default here so the suite
// runs without a .env, while still failing loudly on a half-configured env.
if (!process.env.ADMIN_DATABASE_URL && process.env.DATABASE_URL) {
  process.env.ADMIN_DATABASE_URL = process.env.DATABASE_URL.replace(
    "madar_app:madar_app",
    "madar_admin:madar_admin",
  );
}
