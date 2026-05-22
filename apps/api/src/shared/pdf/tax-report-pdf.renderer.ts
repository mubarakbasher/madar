/**
 * Tax-report PDF renderer.
 *
 * Pure function — no Nest decorators, no Prisma imports — so the renderer is
 * trivially unit-testable. Mirrors `po-pdf.renderer.ts` in structure (header
 * band, lines table, totals row, footer with generated-at + page label).
 *
 * ─── Language constraint ─────────────────────────────────────────────
 * pdf-lib's bundled Helvetica fonts cover WinAnsi only — Arabic glyphs are
 * coerced to "?" via `coerceToWinAnsi`. The tax report is EN-only for v1.
 * Tax-class names are rendered from the `en` payload of the i18n column;
 * the Arabic side is dropped at render time on purpose.
 */
import { PDFDocument, StandardFonts, type PDFFont, type PDFPage, rgb } from "pdf-lib";

// ─── Public input shape ───────────────────────────────────────────────

export interface TaxReportPdfInput {
  tenant: { name: string; tax_registration_number: string | null };
  period: { from: string; to: string };
  currency: string;
  items: Array<{
    tax_class_code: string | null;
    tax_class_name_en: string | null;
    rate_bps: number;
    taxable_sales_cents: string;
    tax_collected_cents: string;
    transactions: number;
  }>;
  totals: {
    taxable_sales_cents: string;
    tax_collected_cents: string;
    transactions: number;
  };
}

// ─── Page geometry (A4 portrait, points) ─────────────────────────────

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN_X = 48;
const MARGIN_TOP = 56;
const MARGIN_BOTTOM = 56;

const COLOR_INK = rgb(0.102, 0.090, 0.078);
const COLOR_MUTED = rgb(0.540, 0.516, 0.470);
const COLOR_RULE = rgb(0.910, 0.894, 0.866);

// ─── Public entry point ──────────────────────────────────────────────

export async function renderTaxReportPdf(input: TaxReportPdfInput): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Tax Report ${input.period.from} to ${input.period.to}`);
  doc.setProducer("Madar POS");
  doc.setCreator("Madar API");
  doc.setCreationDate(new Date());

  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const ctx: RenderCtx = { page, helv, helvBold, input, y: PAGE_HEIGHT - MARGIN_TOP };

  drawHeader(ctx);
  ctx.y -= 10;
  drawDivider(ctx);
  ctx.y -= 18;
  drawTable(ctx);
  drawFooter(ctx);

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

// ─── Internals ───────────────────────────────────────────────────────

interface RenderCtx {
  page: PDFPage;
  helv: PDFFont;
  helvBold: PDFFont;
  input: TaxReportPdfInput;
  y: number;
}

function drawHeader(ctx: RenderCtx): void {
  const { page, helv, helvBold, input } = ctx;
  const leftX = MARGIN_X;
  const rightX = PAGE_WIDTH - MARGIN_X;

  // Left: tenant name + "Tax Report" label
  const tenantName = coerceToWinAnsi(input.tenant.name);
  page.drawText(tenantName, { x: leftX, y: ctx.y, size: 18, font: helvBold, color: COLOR_INK });
  page.drawText("Tax Report", {
    x: leftX,
    y: ctx.y - 18,
    size: 11,
    font: helv,
    color: COLOR_MUTED,
  });

  // Right: period + tax registration number. ASCII-only separator since
  // pdf-lib's bundled Helvetica is WinAnsi-only — see coerceToWinAnsi.
  const periodText = `${input.period.from}  -  ${input.period.to}`;
  const labelText = "PERIOD";
  const labelW = helv.widthOfTextAtSize(labelText, 8);
  page.drawText(labelText, {
    x: rightX - labelW,
    y: ctx.y + 4,
    size: 8,
    font: helv,
    color: COLOR_MUTED,
  });
  const periodW = helvBold.widthOfTextAtSize(periodText, 11);
  page.drawText(periodText, {
    x: rightX - periodW,
    y: ctx.y - 12,
    size: 11,
    font: helvBold,
    color: COLOR_INK,
  });

  const ccyLine = `Currency: ${input.currency}`;
  const ccyW = helv.widthOfTextAtSize(ccyLine, 9);
  page.drawText(ccyLine, {
    x: rightX - ccyW,
    y: ctx.y - 26,
    size: 9,
    font: helv,
    color: COLOR_MUTED,
  });

  // Tax registration number (header-required when present)
  if (input.tenant.tax_registration_number) {
    const trnLine = `Tax registration: ${input.tenant.tax_registration_number}`;
    const trnW = helv.widthOfTextAtSize(trnLine, 9);
    page.drawText(coerceToWinAnsi(trnLine), {
      x: rightX - trnW,
      y: ctx.y - 38,
      size: 9,
      font: helv,
      color: COLOR_MUTED,
    });
    ctx.y -= 44;
  } else {
    ctx.y -= 30;
  }
}

function drawTable(ctx: RenderCtx): void {
  const { page, helv, helvBold, input } = ctx;

  // Column geometry: Tax class | Rate % | Taxable sales | Tax collected | Transactions
  const cols = {
    cls: { x: MARGIN_X, w: 160, align: "left" as const },
    rate: { x: MARGIN_X + 168, w: 50, align: "right" as const },
    taxable: { x: MARGIN_X + 222, w: 110, align: "right" as const },
    collected: { x: MARGIN_X + 336, w: 110, align: "right" as const },
    tx: { x: MARGIN_X + 450, w: 50, align: "right" as const },
  };

  drawCell(page, "Tax class", cols.cls, ctx.y, helvBold, 9, COLOR_MUTED);
  drawCell(page, "Rate %", cols.rate, ctx.y, helvBold, 9, COLOR_MUTED);
  drawCell(page, "Taxable sales", cols.taxable, ctx.y, helvBold, 9, COLOR_MUTED);
  drawCell(page, "Tax collected", cols.collected, ctx.y, helvBold, 9, COLOR_MUTED);
  drawCell(page, "Transactions", cols.tx, ctx.y, helvBold, 9, COLOR_MUTED);
  ctx.y -= 6;
  page.drawLine({
    start: { x: MARGIN_X, y: ctx.y },
    end: { x: PAGE_WIDTH - MARGIN_X, y: ctx.y },
    thickness: 0.5,
    color: COLOR_RULE,
  });
  ctx.y -= 12;

  const ROW_H = 14;
  const tableBottom = MARGIN_BOTTOM + 70; // reserve space for totals + footer
  const maxRows = Math.max(0, Math.floor((ctx.y - tableBottom) / ROW_H));
  const visible = input.items.slice(0, maxRows);

  for (const item of visible) {
    const rowY = ctx.y;
    const label = item.tax_class_code
      ? item.tax_class_name_en
        ? `${item.tax_class_code} · ${item.tax_class_name_en}`
        : item.tax_class_code
      : "No tax class";
    drawCell(page, truncate(label, 32), cols.cls, rowY, helv, 9, COLOR_INK);
    drawCell(page, formatRatePct(item.rate_bps), cols.rate, rowY, helv, 9, COLOR_INK);
    drawCell(
      page,
      formatMoney(input.currency, item.taxable_sales_cents),
      cols.taxable,
      rowY,
      helv,
      9,
      COLOR_INK,
    );
    drawCell(
      page,
      formatMoney(input.currency, item.tax_collected_cents),
      cols.collected,
      rowY,
      helvBold,
      9,
      COLOR_INK,
    );
    drawCell(page, String(item.transactions), cols.tx, rowY, helv, 9, COLOR_INK);
    ctx.y -= ROW_H;
  }

  if (input.items.length > visible.length) {
    const overflow = input.items.length - visible.length;
    page.drawText(`…and ${overflow} more group${overflow === 1 ? "" : "s"}`, {
      x: MARGIN_X,
      y: ctx.y,
      size: 8,
      font: helv,
      color: COLOR_MUTED,
    });
    ctx.y -= ROW_H;
  }

  // Totals divider + row
  ctx.y -= 2;
  page.drawLine({
    start: { x: MARGIN_X, y: ctx.y },
    end: { x: PAGE_WIDTH - MARGIN_X, y: ctx.y },
    thickness: 0.5,
    color: COLOR_RULE,
  });
  ctx.y -= 14;
  drawCell(page, "Totals", cols.cls, ctx.y, helvBold, 10, COLOR_INK);
  drawCell(
    page,
    formatMoney(input.currency, input.totals.taxable_sales_cents),
    cols.taxable,
    ctx.y,
    helvBold,
    10,
    COLOR_INK,
  );
  drawCell(
    page,
    formatMoney(input.currency, input.totals.tax_collected_cents),
    cols.collected,
    ctx.y,
    helvBold,
    10,
    COLOR_INK,
  );
  drawCell(page, String(input.totals.transactions), cols.tx, ctx.y, helvBold, 10, COLOR_INK);
  ctx.y -= 16;
}

function drawFooter(ctx: RenderCtx): void {
  const { page, helv } = ctx;
  const y = 30;
  const generatedLine = `Generated ${new Date().toISOString()}`;
  page.drawText(generatedLine, {
    x: MARGIN_X,
    y,
    size: 8,
    font: helv,
    color: COLOR_MUTED,
  });
  const pageLabel = "1/1";
  const w = helv.widthOfTextAtSize(pageLabel, 8);
  page.drawText(pageLabel, {
    x: PAGE_WIDTH - MARGIN_X - w,
    y,
    size: 8,
    font: helv,
    color: COLOR_MUTED,
  });
}

function drawDivider(ctx: RenderCtx): void {
  const { page } = ctx;
  page.drawLine({
    start: { x: MARGIN_X, y: ctx.y },
    end: { x: PAGE_WIDTH - MARGIN_X, y: ctx.y },
    thickness: 0.5,
    color: COLOR_RULE,
  });
}

interface ColSpec {
  x: number;
  w: number;
  align: "left" | "right";
}

function drawCell(
  page: PDFPage,
  text: string,
  col: ColSpec,
  y: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
): void {
  const safe = coerceToWinAnsi(text);
  const w = font.widthOfTextAtSize(safe, size);
  const x = col.align === "right" ? col.x + col.w - w : col.x;
  page.drawText(safe, { x, y, size, font, color });
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Format an integer-cents string as `{CCY} {N.NN}`. String arithmetic only —
 * avoids float-cents pitfalls. Accepts a string (decimal cents) input so the
 * wire-format `taxable_sales_cents: string` flows through without conversion.
 * Two-decimal output regardless of the currency's minor-unit count.
 */
export function formatMoney(currencyCode: string, cents: string | number | bigint): string {
  const asBig = typeof cents === "bigint" ? cents : BigInt(cents);
  const negative = asBig < 0n;
  const abs = negative ? -asBig : asBig;
  const major = abs / 100n;
  const minor = abs % 100n;
  const majorStr = Number(major).toLocaleString("en-US");
  const minorStr = minor.toString().padStart(2, "0");
  return `${currencyCode} ${negative ? "-" : ""}${majorStr}.${minorStr}`;
}

/** Format a basis-points rate as a percentage, e.g. 1500 -> "15.00%". */
export function formatRatePct(rateBps: number): string {
  const pct = rateBps / 100;
  return `${pct.toFixed(2)}%`;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function coerceToWinAnsi(s: string): string {
  const allowed = /[\x20-\x7E\xA0-\xFF–—‘’“”…]/;
  let out = "";
  for (const ch of s) {
    if (allowed.test(ch)) out += ch;
    else out += "?";
  }
  return out;
}
