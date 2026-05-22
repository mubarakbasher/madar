import { setRequestLocale } from "next-intl/server";
import { ProfileClient } from "./profile-client";
import "./profile.css";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ProfileClient locale={locale === "ar" ? "ar" : "en"} />;
}
