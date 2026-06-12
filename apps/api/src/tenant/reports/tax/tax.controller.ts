import { Controller, Get, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { ZodValidationPipe } from "../../../common/zod-validation.pipe";
import { minorToDecimalString } from "../../../common/currency";
import { RateLimit, RateLimitGuard } from "../../../common/rate-limit.guard";
import { CurrentUser, type TenantPrincipal } from "../../auth/current-user.decorator";
import { renderTaxReportPdf, type TaxReportPdfInput } from "../../../shared/pdf/tax-report-pdf.renderer";
import { TaxReportService } from "./tax.service";
import { TaxQuerySchema, type TaxQuery } from "./dto/tax.dto";

@Controller("v1/reports/tax")
@UseGuards(RateLimitGuard)
export class TaxReportController {
  constructor(private readonly svc: TaxReportService) {}

  @Get()
  @RateLimit({ max: 60, windowMs: 60_000 })
  async get(
    @CurrentUser() user: TenantPrincipal,
    @Query(new ZodValidationPipe(TaxQuerySchema)) q: TaxQuery,
    @Res() res: Response,
  ) {
    this.svc.assertCanRead(user.role);
    const report = await this.svc.getReport(user.tenantId, q);

    if (q.format === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="tax_${q.from}_${q.to}.csv"`,
      );
      res.setHeader("Cache-Control", "private, no-store");
      res.send(buildCsv(report));
      return;
    }

    if (q.format === "pdf") {
      const tenantName = await this.svc.getTenantName(user.tenantId);
      const pdfInput: TaxReportPdfInput = {
        tenant: { name: tenantName, tax_registration_number: report.tax_registration_number },
        period: { from: report.from, to: report.to },
        currency: report.currency,
        items: report.items.map((it) => ({
          tax_class_code: it.tax_class_code,
          tax_class_name_en: it.tax_class_name_i18n?.en ?? null,
          rate_bps: it.rate_bps,
          taxable_sales_cents: it.taxable_sales_cents,
          tax_collected_cents: it.tax_collected_cents,
          transactions: it.transactions,
        })),
        totals: report.totals,
      };
      const pdf = await renderTaxReportPdf(pdfInput);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="tax_${q.from}_${q.to}.pdf"`,
      );
      res.setHeader("Cache-Control", "private, no-store");
      res.send(pdf);
      return;
    }

    res.json(report);
  }
}

function csvEscape(s: string): string {
  // RFC 4180: wrap in double-quotes if the field contains comma/quote/newline,
  // and double up internal quotes.
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCsv(report: {
  currency: string;
  items: Array<{
    tax_class_code: string | null;
    rate_bps: number;
    taxable_sales_cents: string;
    tax_collected_cents: string;
    transactions: number;
  }>;
  totals: { taxable_sales_cents: string; tax_collected_cents: string; transactions: number };
}): string {
  // Amounts use the currency's true minor-unit count (KWD=3, JPY=0).
  const dec = (cents: string) => minorToDecimalString(cents, report.currency);
  const header = "tax_class_code,rate_pct,taxable_sales,tax_collected,transactions";
  const rows = report.items.map((it) =>
    [
      csvEscape(it.tax_class_code ?? ""),
      (it.rate_bps / 100).toFixed(2),
      dec(it.taxable_sales_cents),
      dec(it.tax_collected_cents),
      String(it.transactions),
    ].join(","),
  );
  const totalsRow = [
    "TOTAL",
    "",
    dec(report.totals.taxable_sales_cents),
    dec(report.totals.tax_collected_cents),
    String(report.totals.transactions),
  ].join(",");
  return [header, ...rows, totalsRow].join("\r\n") + "\r\n";
}
