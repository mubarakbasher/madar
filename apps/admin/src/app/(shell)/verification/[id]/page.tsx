import { ProofDetailClient } from "./proof-detail-client";

export default async function ProofDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProofDetailClient proofId={id} />;
}
