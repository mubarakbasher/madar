import { setRequestLocale } from "next-intl/server";
import { EditBranchClient } from "./edit-client";
import "../../branches.css";

export default async function EditBranchPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <EditBranchClient locale={locale} id={id} />;
}
