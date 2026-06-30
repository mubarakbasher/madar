-- Fixed assets — tenant-scoped register of physical assets (chairs, tables,
-- etc.) recorded per branch with a quantity. Standard tenant table: soft
-- delete, audit columns, RLS. Policies are role-scoped per ADR 0004 (no
-- `app.is_super_admin` branch — that GUC was removed in 20260612000000).
--
-- NOTE: the FK and the expression partial-unique below are SQL-only; the
-- Prisma `FixedAsset` model declares no `@relation` and cannot express either,
-- so Prisma does not diff them (no drift). The `@@index`es on the model match
-- the canonical index names created here.

-- CreateTable
CREATE TABLE "fixed_assets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "name_i18n" JSONB NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "fixed_assets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fixed_assets_quantity_nonneg" CHECK ("quantity" >= 0)
);

-- CreateIndex
CREATE INDEX "fixed_assets_tenant_id_deleted_at_idx" ON "fixed_assets"("tenant_id", "deleted_at");
CREATE INDEX "fixed_assets_tenant_id_branch_id_idx" ON "fixed_assets"("tenant_id", "branch_id");

-- One asset line per (tenant, branch, English name), case-insensitive, ignoring
-- soft-deleted rows. Re-adding the same name to a branch hits this; the service
-- maps the resulting P2002 to 409 asset_exists.
CREATE UNIQUE INDEX "fixed_assets_tenant_branch_name_en_unique"
  ON "fixed_assets" ("tenant_id", "branch_id", (lower("name_i18n"->>'en')))
  WHERE "deleted_at" IS NULL;

-- Branch FK (SQL-level only; RESTRICT — branches soft-delete, never hard-drop).
ALTER TABLE "fixed_assets"
  ADD CONSTRAINT "fixed_assets_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT;

-- updated_at trigger (shared fn defined in 20260514000000_init).
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON "fixed_assets"
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- RLS — role-scoped (ADR 0004). madar_app sees only its own tenant; madar_admin
-- (adminPrisma) sees everything. No super-admin GUC branch.
ALTER TABLE "fixed_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fixed_assets" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "fixed_assets"
  FOR ALL TO madar_app
  USING (
    tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  );

CREATE POLICY admin_full_access ON "fixed_assets"
  FOR ALL TO madar_admin
  USING (true)
  WITH CHECK (true);
