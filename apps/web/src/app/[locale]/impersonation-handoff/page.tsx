import { ImpersonationHandoffClient } from "./client";

export const dynamic = "force-dynamic";

// The URL carries ONLY a single-use 60s handoff code — never the JWT, and no
// tenant/admin details (the exchange response provides them after the user
// confirms). Anything in a URL ends up in history, proxies, and access logs.
export default async function ImpersonationHandoffPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const sp = await searchParams;
  return <ImpersonationHandoffClient code={sp.code ?? ""} />;
}
