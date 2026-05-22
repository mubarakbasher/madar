import { setRequestLocale } from "next-intl/server";
import { SyncConflictsClient } from "./sync-conflicts-client";

export default async function SyncConflictsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<JSX.Element> {
  const { locale } = await params;
  setRequestLocale(locale);
  return <SyncConflictsClient locale={locale} />;
}
