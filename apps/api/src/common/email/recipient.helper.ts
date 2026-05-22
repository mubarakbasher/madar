import { adminPrisma } from "@madar/db";
import { pickLocale } from "./email.service";
import type { EmailLocale } from "./email.types";

export interface TenantPrimaryRecipient {
  user_id: string;
  email: string;
  name: string;
  locale: EmailLocale;
}

/**
 * Resolve the email + display name for a tenant's primary contact (the owner
 * with the earliest `created_at`). Returns null when no active owner exists —
 * callers must guard against that and log, never send.
 *
 * Centralized so future emails don't re-implement the lookup.
 */
export async function getTenantPrimaryRecipient(
  tenantId: string,
): Promise<TenantPrimaryRecipient | null> {
  const owner = await adminPrisma.user.findFirst({
    where: {
      tenant_id: tenantId,
      role: "owner",
      is_active: true,
      deleted_at: null,
    },
    orderBy: { created_at: "asc" },
    select: { id: true, email: true, name: true, locale: true },
  });
  if (!owner) return null;
  return {
    user_id: owner.id,
    email: owner.email,
    name: owner.name,
    locale: pickLocale(owner.locale),
  };
}
