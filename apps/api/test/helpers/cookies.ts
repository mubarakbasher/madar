import cookie from "cookie";
import type { Response as SupertestResponse } from "supertest";

export interface ParsedCookie {
  value: string;
  attrs: Record<string, string | true>;
}

/**
 * Parse a single named cookie out of supertest's response Set-Cookie header.
 * Returns the value plus a normalised attribute map (HttpOnly, SameSite, Path,
 * Max-Age, Expires, Secure, Domain). Attribute names are lowercased.
 */
export function parseSetCookie(res: SupertestResponse, name: string): ParsedCookie | null {
  const raw = res.headers["set-cookie"];
  if (!raw) return null;
  const list = Array.isArray(raw) ? raw : [raw];
  for (const line of list) {
    const parsed = cookie.parse(line);
    if (parsed[name] === undefined) continue;
    const attrs: Record<string, string | true> = {};
    const segments = line.split(";").slice(1);
    for (const seg of segments) {
      const trimmed = seg.trim();
      if (!trimmed) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) {
        attrs[trimmed.toLowerCase()] = true;
      } else {
        const k = trimmed.slice(0, eq).trim().toLowerCase();
        const v = trimmed.slice(eq + 1).trim();
        attrs[k] = v;
      }
    }
    return { value: parsed[name]!, attrs };
  }
  return null;
}

export const REFRESH_COOKIE_NAME = "madar_refresh";
