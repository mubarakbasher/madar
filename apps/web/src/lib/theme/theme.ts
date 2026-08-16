"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "../../../i18n/routing";
import {
  THEME_COOKIE,
  formatThemeCookie,
  parseThemeCookie,
  type ResolvedTheme,
  type ThemePreference,
} from "./cookie";

export type { ThemePreference, ResolvedTheme };
export { THEME_COOKIE };

/**
 * The preference lives in a cookie, not localStorage, because <html> is
 * rendered by [locale]/layout.tsx. Switching language re-renders that element,
 * and React discards any attribute it did not itself render — which silently
 * reverted an imperatively-set data-theme to light on every language switch.
 * Rendering it as a real server prop is what makes it survive; a cookie is how
 * the server learns the value.
 */
function readCookie(): string | undefined {
  if (typeof document === "undefined") return undefined;
  return document.cookie.match(new RegExp(`${THEME_COOKIE}=([^;]*)`))?.[1];
}

export function readPreference(): ThemePreference {
  const raw = readCookie();
  if (raw) return parseThemeCookie(raw).preference;
  // One-time migration: the preference used to live in localStorage under the
  // same key. Without this, everyone who had explicitly chosen light or dark
  // would be silently reset to "system" by this change.
  try {
    const legacy = localStorage.getItem(THEME_COOKIE);
    if (legacy === "light" || legacy === "dark") return legacy;
  } catch {
    /* private mode — fall through to system */
  }
  return "system";
}

function resolve(pref: ThemePreference): ResolvedTheme {
  if (pref === "light" || pref === "dark") return pref;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Flip `data-theme` and persist both halves so the next server render matches. */
export function applyPreference(pref: ThemePreference): void {
  const resolved = resolve(pref);
  document.documentElement.setAttribute("data-theme", resolved);
  // Not HttpOnly: the client reads it too. Display-only, nothing sensitive.
  document.cookie = `${THEME_COOKIE}=${formatThemeCookie(pref, resolved)}; path=/; max-age=31536000; SameSite=Lax`;
}

/** Read + write the stored preference; applying it flips `data-theme`. */
export function useThemePreference(): [ThemePreference, (p: ThemePreference) => void] {
  const [pref, setPref] = useState<ThemePreference>("system");
  useEffect(() => {
    setPref(readPreference());
  }, []);
  const update = useCallback((next: ThemePreference) => {
    setPref(next);
    applyPreference(next);
  }, []);
  return [pref, update];
}

/**
 * Mounted once in the locale layout. Three jobs:
 *
 *  - re-assert `data-theme` after a client navigation. For a first-ever
 *    visitor the server has no cookie to render from, so React leaves the
 *    attribute off; this also seeds the cookie so no later render flashes.
 *  - keep "system" users in step with the OS.
 *  - pick up a change made in another tab. Cookies fire no storage event, so
 *    this re-reads on focus instead.
 */
export function ThemeWatcher() {
  const pathname = usePathname();

  useEffect(() => {
    applyPreference(readPreference());
  }, [pathname]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onMedia = () => {
      if (readPreference() === "system") applyPreference("system");
    };
    const onFocus = () => applyPreference(readPreference());
    media.addEventListener("change", onMedia);
    window.addEventListener("focus", onFocus);
    return () => {
      media.removeEventListener("change", onMedia);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return null;
}
