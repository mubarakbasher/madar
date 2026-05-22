import { setRequestLocale } from "next-intl/server";
import { BranchForm } from "../_components/BranchForm";
import "../branches.css";

export default async function NewBranchPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <BranchForm locale={locale} mode="create" />;
}
