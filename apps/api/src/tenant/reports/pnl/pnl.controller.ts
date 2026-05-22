import { Controller, Get, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { ZodValidationPipe } from "../../../common/zod-validation.pipe";
import { RateLimit, RateLimitGuard } from "../../../common/rate-limit.guard";
import { CurrentUser, type TenantPrincipal } from "../../auth/current-user.decorator";
import { PnlService, type ApiPnlReport } from "./pnl.service";
import { PnlQuerySchema, type PnlQuery } from "./dto/pnl.dto";

@Controller("v1/reports/pnl")
@UseGuards(RateLimitGuard)
export class PnlController {
  constructor(private readonly pnl: PnlService) {}

  @Get()
  @RateLimit({ max: 60, windowMs: 60_000 })
  async get(
    @CurrentUser() user: TenantPrincipal,
    @Query(new ZodValidationPipe(PnlQuerySchema)) q: PnlQuery,
    @Res() res: Response,
  ) {
    this.pnl.assertCanRead(user.role);
    const report = await this.pnl.generate(user.tenantId, q);

    if (q.format === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="pnl_${q.from}_${q.to}.csv"`,
      );
      res.setHeader("Cache-Control", "no-store");
      res.send(renderCsv(report));
      return;
    }

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.send(JSON.stringify(report));
  }
}

function renderCsv(r: ApiPnlReport): string {
  const header = "period,revenue,discount,tax,cogs,gross_profit,transactions";
  // Top-level statement row first (with discount + tax columns set), then
  // per-bucket rows (no per-bucket discount/tax — those are not in the
  // breakdown). Empty cells render as `,,`.
  const lines: string[] = [header];
  lines.push(
    [
      csvEscape(r.period_label),
      r.revenue_cents,
      r.discount_cents,
      r.tax_cents,
      r.cogs_cents,
      r.gross_profit_cents,
      String(r.transactions),
    ].join(","),
  );
  for (const b of r.breakdown) {
    const label =
      b.label ??
      (b.label_i18n
        ? (b.label_i18n as { en: string }).en
        : b.key);
    lines.push(
      [
        csvEscape(label),
        b.revenue_cents,
        "",
        "",
        b.cogs_cents,
        b.gross_profit_cents,
        String(b.transactions),
      ].join(","),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}

function csvEscape(s: string): string {
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
