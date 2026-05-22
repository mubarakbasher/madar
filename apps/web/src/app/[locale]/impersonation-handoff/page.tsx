import { ImpersonationHandoffClient } from "./client";

export const dynamic = "force-dynamic";

export default async function ImpersonationHandoffPage({
  searchParams,
}: {
  searchParams: Promise<{
    token?: string;
    tenant_id?: string;
    tenant_name?: string;
    user_email?: string;
    expires_at?: string;
  }>;
}) {
  const sp = await searchParams;
  return (
    <ImpersonationHandoffClient
      token={sp.token ?? ""}
      tenantName={sp.tenant_name ?? "(tenant)"}
      adminEmail={sp.user_email ?? "(admin)"}
      expiresAt={sp.expires_at ?? ""}
    />
  );
}
