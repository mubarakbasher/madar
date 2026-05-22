import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LoginClient } from "./login-client";

const ADMIN_REFRESH_COOKIE = "madar_admin_refresh";

/**
 * If a valid-looking refresh cookie is present, bounce to / immediately —
 * the actual session bind happens in the layout's bootstrap effect.
 */
export default function LoginPage() {
  const refresh = cookies().get(ADMIN_REFRESH_COOKIE)?.value;
  if (refresh) {
    redirect("/");
  }
  return <LoginClient />;
}
