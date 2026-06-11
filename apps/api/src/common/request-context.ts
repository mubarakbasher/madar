import type { Request } from "express";

export function getClientIp(req: Request): string {
  // req.ip is resolved by Express under `trust proxy` (rightmost untrusted
  // XFF entry). Never read the leftmost X-Forwarded-For entry directly —
  // it is client-supplied and spoofable, which would defeat IP rate limits
  // and let attackers forge audit-log IPs.
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

export function getUserAgent(req: Request): string {
  return (req.headers["user-agent"] as string | undefined) ?? "unknown";
}
