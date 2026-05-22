import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { authenticator } from "otplib";
import { adminPrisma } from "@madar/db";

const ARGON2_PARAMS = {
  type: 2 as const,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
};

export interface PlatformUserFixture {
  platformUserId: string;
  email: string;
  password: string;
  mfaSecret: string;
  role: "owner" | "finance" | "support" | "developer" | "readonly";
}

function uniqueEmail(prefix: string): string {
  return `${prefix.toLowerCase()}-${randomUUID().slice(0, 8)}@platform.test`;
}

function freshBase32Secret(): string {
  // otplib's authenticator generates an RFC-4648 base32 secret of the right
  // size for SHA1 HMAC. Stable across the spec run.
  return authenticator.generateSecret();
}

export async function makePlatformUser(opts?: {
  password?: string;
  role?: PlatformUserFixture["role"];
  mfaEnabled?: boolean;
  emailPrefix?: string;
}): Promise<PlatformUserFixture> {
  const password = opts?.password ?? "AdminPass1!";
  const role = opts?.role ?? "owner";
  const mfaEnabled = opts?.mfaEnabled ?? true;
  const email = uniqueEmail(opts?.emailPrefix ?? "admin");
  const password_hash = await argon2.hash(password, ARGON2_PARAMS);
  const mfaSecret = freshBase32Secret();

  const user = await adminPrisma.platformUser.create({
    data: {
      email,
      password_hash,
      name: "Test Admin",
      role,
      mfa_secret: mfaEnabled ? mfaSecret : null,
      mfa_enabled: mfaEnabled,
    },
  });

  return { platformUserId: user.id, email, password, mfaSecret, role };
}

export async function readPlatformAudit(
  platformUserId: string,
  action?: string,
): Promise<Array<{ action: string; metadata: unknown; target_tenant_id: string | null }>> {
  return adminPrisma.platformAuditLog.findMany({
    where: { platform_user_id: platformUserId, ...(action ? { action } : {}) },
    orderBy: { created_at: "desc" },
    select: { action: true, metadata: true, target_tenant_id: true },
  });
}

export interface SimpleTenantSpec {
  status?: "trialing" | "active" | "grace_period" | "suspended" | "cancelled";
  country?: string;
  planCode?: string;
  trialEndsAt?: Date | null;
  createdAt?: Date;
}

export interface SimpleTenantFixture {
  id: string;
  slug: string;
  name: string;
  planId: string;
  planCode: string;
  country: string;
  status: string;
}

const ALL_PLAN_CODES = ["starter", "growth", "business", "enterprise"] as const;

/**
 * Ensure all four canonical plans exist; idempotent across spec files.
 */
export async function seedAllPlans(): Promise<Map<string, { id: string }>> {
  const plans = new Map<string, { id: string }>();
  for (const code of ALL_PLAN_CODES) {
    const p = await adminPrisma.plan.upsert({
      where: { code },
      update: {},
      create: {
        code,
        name_i18n: {
          en: code[0]!.toUpperCase() + code.slice(1),
          ar: code,
        },
        monthly_price_cents: planPrice(code),
        currency_code: "USD",
        limits: {},
      },
    });
    plans.set(code, { id: p.id });
  }
  return plans;
}

function planPrice(code: string): bigint {
  switch (code) {
    case "starter":
      return 4900n;
    case "growth":
      return 14900n;
    case "business":
      return 39900n;
    case "enterprise":
      return 99900n;
    default:
      return 1000n;
  }
}

/**
 * Quickly mint N tenants with caller-controlled status / country / plan
 * variation. Used by dashboard + tenants tests that need a populated cross-
 * tenant universe.
 */
export async function makeMultipleTenants(
  specs: SimpleTenantSpec[],
): Promise<SimpleTenantFixture[]> {
  const plans = await seedAllPlans();
  const fixtures: SimpleTenantFixture[] = [];
  for (let i = 0; i < specs.length; i++) {
    const s = specs[i]!;
    const planCode = s.planCode ?? "starter";
    const plan = plans.get(planCode)!;
    const slug = `t-${randomUUID().slice(0, 8)}`;
    const name = `Tenant ${slug}`;
    const country = s.country ?? "EG";
    const status = s.status ?? "active";
    const tenant = await adminPrisma.tenant.create({
      data: {
        slug,
        name,
        name_i18n: { en: name, ar: name },
        country_code: country,
        default_currency_code: "USD",
        default_locale: "en",
        plan_id: plan.id,
        status,
        trial_ends_at: s.trialEndsAt ?? null,
        ...(s.createdAt ? { created_at: s.createdAt } : {}),
      },
    });
    fixtures.push({
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      planId: plan.id,
      planCode,
      country,
      status,
    });
  }
  return fixtures;
}

/**
 * Drop all tenant-scoped + tenant rows except those belonging to the
 * supplied ids. Used at the start of dashboard/tenants tests to isolate
 * each spec from sibling-spec fixtures inside the singleFork process.
 *
 * Per CLAUDE.md, deletes go through adminPrisma so RLS doesn't fight us.
 */
export async function isolateTenantUniverse(keepTenantIds: string[]): Promise<void> {
  const keep = keepTenantIds.length
    ? { tenant_id: { notIn: keepTenantIds } }
    : {};
  // Delete dependents first (FK cascade order).
  // audit_log is append-only at the DB level — skip; the dashboard activity
  // tests are robust to stale audit rows (they pin tenant_ids by kind+limit).
  await adminPrisma.paymentProof.deleteMany({ where: keep });
  await adminPrisma.subscriptionInvoice.deleteMany({ where: keep });
  await adminPrisma.saleLine.deleteMany({ where: keep });
  await adminPrisma.sale.deleteMany({ where: keep });
  await adminPrisma.stockMovement.deleteMany({ where: keep });
  await adminPrisma.branchStock.deleteMany({ where: keep });
  await adminPrisma.product.deleteMany({ where: keep });
  await adminPrisma.category.deleteMany({ where: keep });
  await adminPrisma.customer.deleteMany({ where: keep });
  await adminPrisma.tenantBankAccount.deleteMany({ where: keep });
  await adminPrisma.branch.deleteMany({ where: keep });
  await adminPrisma.user.deleteMany({ where: keep });
  await adminPrisma.tenant.deleteMany({
    where: keepTenantIds.length ? { id: { notIn: keepTenantIds } } : {},
  });
}
