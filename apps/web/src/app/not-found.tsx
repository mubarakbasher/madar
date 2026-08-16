import { redirect } from "next/navigation";
import { routing } from "../../i18n/routing";

/**
 * Root-level 404.
 *
 * `[locale]/layout.tsx` calls notFound() for an unrecognised locale, which
 * resolves against the ROOT segment — and the root layout is a pass-through
 * with no <html>, no fonts and no theme. Without this file Next rendered its
 * own unstyled 404 there, which is how a bad locale produced a bare white page
 * in an otherwise dark app.
 *
 * Redirecting into the default locale hands the request to the branded,
 * translated 404 at [locale]/not-found.tsx rather than duplicating it here.
 */
export default function RootNotFound() {
  redirect(`/${routing.defaultLocale}/404`);
}
