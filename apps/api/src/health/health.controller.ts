import { Controller, Get } from "@nestjs/common";
import { basePrisma } from "@madar/db";
import { Public } from "../tenant/auth/public.decorator";

@Controller("healthz")
export class HealthController {
  @Get()
  @Public()
  async check() {
    let db: "up" | "down" = "down";
    try {
      await basePrisma.$queryRaw`SELECT 1`;
      db = "up";
    } catch {
      db = "down";
    }
    return { ok: db === "up", db, uptimeMs: Math.round(process.uptime() * 1000) };
  }
}
