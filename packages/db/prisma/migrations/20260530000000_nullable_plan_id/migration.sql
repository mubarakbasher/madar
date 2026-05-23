-- Make tenant.plan_id nullable so signup can create a tenant without a plan
-- and the tenant self-picks via /v1/onboarding/select-plan. Existing tenants
-- already have plan_id populated; this migration is data-safe.
ALTER TABLE "tenants" ALTER COLUMN "plan_id" DROP NOT NULL;
