"use client";

import { useCallback, useEffect, useState } from "react";

export type ThemePreference = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "madar_theme";

export function readPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

function resolve(pref: ThemePreference): "light" | "dark" {
  if (pref === "light" || pref === "dark") return pref;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyPreference(pref: ThemePreference): void {
  document.documentElement.setAttribute("data-theme", resolve(pref));
}

/** Read + write the stored preference; applying it flips `data-theme`. */
export function useThemePreference(): [ThemePreference, (p: ThemePreference) => void] {
  const [pref, setPref] = useState<ThemePreference>("system");
  useEffect(() => {
    setPref(readPreference());
  }, []);
  const update = useCallback((next: ThemePreference) => {
    setPref(next);
    try {
      if (next === "system") localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* storage unavailable (private mode) — theme still applies for the session */
    }
    applyPreference(next);
  }, []);
  return [pref, update];
}

/** Mounted once in the locale layout: keeps `data-theme` in sync with
 *  system-preference changes (when set to "system") and other tabs. */
export function ThemeWatcher() {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onMedia = () => {
      if (readPreference() === "system") applyPreference("system");
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY) applyPreference(readPreference());
    };
    media.addEventListener("change", onMedia);
    window.addEventListener("storage", onStorage);
    return () => {
      media.removeEventListener("change", onMedia);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return null;
}
