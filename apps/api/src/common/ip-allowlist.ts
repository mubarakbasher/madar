import type { NextFunction, Request, Response } from "express";
import { getClientIp } from "./request-context";

/**
 * Optional IP allowlist for the admin realm (CLAUDE.md: "Optional IP
 * allowlist for production"). Mounted as Express middleware on /v1/admin in
 * main.ts — one chokepoint that also covers the public login/refresh routes,
 * which no guard sees. Entries: exact IPs (v4 or v6) and IPv4 CIDRs.
 */

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let out = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    out = out * 256 + n;
  }
  return out;
}

/** Strip the IPv4-mapped-IPv6 prefix Express often reports ("::ffff:1.2.3.4"). */
function normalize(ip: string): string {
  return ip.startsWith("::ffff:") ? ip.slice("::ffff:".length) : ip;
}

export function isIpAllowed(rawIp: string, entries: readonly string[]): boolean {
  if (entries.length === 0) return true;
  const ip = normalize(rawIp);
  for (const entry of entries) {
    if (entry.includes("/")) {
      const [base, bitsStr] = entry.split("/");
      const bits = Number(bitsStr);
      const baseInt = ipv4ToInt(base ?? "");
      const ipInt = ipv4ToInt(ip);
      if (baseInt === null || ipInt === null || !Number.isInteger(bits) || bits < 0 || bits > 32) {
        continue;
      }
      // >>> 0 keeps the mask unsigned; bits=0 means match-all.
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      if (((ipInt & mask) >>> 0) === ((baseInt & mask) >>> 0)) return true;
    } else if (normalize(entry) === ip) {
      return true;
    }
  }
  return false;
}

export function adminIpAllowlistMiddleware(entries: readonly string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (isIpAllowed(getClientIp(req), entries)) {
      next();
      return;
    }
    // Same shape as other auth failures; deliberately does not echo the IP.
    res.status(403).json({
      code: "admin_ip_blocked",
      message: "This address is not allowed to access the admin API",
    });
  };
}
