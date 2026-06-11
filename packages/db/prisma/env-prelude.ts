// Imported FIRST by seed/bootstrap scripts (before ../src/admin, whose
// adminPrisma constructs eagerly and requires ADMIN_DATABASE_URL). Derives
// the dev-convention madar_admin URL from DATABASE_URL when unset so
// `pnpm db:seed` keeps working with the documented two-URL dev setup.
if (!process.env.ADMIN_DATABASE_URL && process.env.DATABASE_URL) {
  process.env.ADMIN_DATABASE_URL = process.env.DATABASE_URL.replace(
    "madar_app:madar_app",
    "madar_admin:madar_admin",
  );
}
