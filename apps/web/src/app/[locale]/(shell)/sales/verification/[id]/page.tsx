import { setRequestLocale } from "next-intl/server";
import { ProofDetailClient } from "./proof-detail-client";

export default async function ProofDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <ProofDetailClient proofId={id} />;
}
