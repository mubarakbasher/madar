import { requireAdminAuth } from "@/lib/auth/server";
import { TenantDetailClient } from "./tenant-detail-client";

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  requireAdminAuth();
  const { id } = await params;
  return <TenantDetailClient tenantId={id} />;
}
