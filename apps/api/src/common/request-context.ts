import type { Request } from "express";

export function getClientIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) {
    const first = fwd.split(",")[0];
    if (first) return first.trim();
  }
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

export function getUserAgent(req: Request): string {
  return (req.headers["user-agent"] as string | undefined) ?? "unknown";
}
