// Pure theme-cookie helpers, shared by the server layout and the client
// watcher. Deliberately NOT "use client": [locale]/layout.tsx is a server
// component and needs to read the cookie to render <html data-theme>.

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_COOKIE = "madar_theme";

/**
 * `madar_theme=<preference>.<resolved>` — e.g. "system.dark", "light.light".
 *
 * Both halves are stored because the server cannot read prefers-color-scheme.
 * Without a concrete resolved value, a "system" user on a dark OS gets a light
 * flash on every cold load.
 */
export function parseThemeCookie(raw: string | undefined | null): {
  preference: ThemePreference;
  resolved: ResolvedTheme | null;
} {
  const [pref, res] = (raw ?? "").split(".");
  const preference: ThemePreference =
    pref === "light" || pref === "dark" || pref === "system" ? pref : "system";
  const resolved: ResolvedTheme | null = res === "light" || res === "dark" ? res : null;
  return { preference, resolved };
}

export function formatThemeCookie(pref: ThemePreference, resolved: ResolvedTheme): string {
  return `${pref}.${resolved}`;
}

/** The theme to render on <html>, or null when it isn't knowable yet. */
export function resolvedThemeFromCookie(raw: string | undefined): ResolvedTheme | null {
  const { preference, resolved } = parseThemeCookie(raw);
  if (preference === "light" || preference === "dark") return preference;
  return resolved;
}
