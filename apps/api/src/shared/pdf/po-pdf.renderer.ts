/**
 * Purchase-order PDF renderer.
 *
 * Pure function — no Nest decorators, no Prisma imports — so the renderer is
 * trivially unit-testable and reusable from any context (BullMQ worker, ad-hoc
 * script, CLI export). Callers assemble the `PurchaseOrderPdfInput` shape from
 * whatever data source they have (Prisma in the API, fixtures in tests).
 *
 * ─── Language constraint ─────────────────────────────────────────────
 * pdf-lib's bundled standard fonts (Helvetica family) cover the WinAnsi
 * encoding only — they CANNOT render Arabic glyphs. The PO PDF is therefore
 * intentionally English-only. Arabic PO rendering would require embedding
 * IBM Plex Sans Arabic as a TTF and shaping right-to-left text, which is
 * deferred until there's clear demand. See CLAUDE.md "i18n & RTL" — text in
 * the PDF is treated as machine-generated trade data, not user-facing UI.
 *
 * The supplier name and notes are written verbatim — if a tenant supplies an
 * Arabic supplier name today, pdf-lib will throw when encoding it (the call
 * site catches that and falls back to a sanitized name). See
 * `coerceToWinAnsi()` below.
 */
import { PDFDocument, StandardFonts, type PDFFont, type PDFPage, rgb } from "pdf-lib";
import { currencyMinorUnits } from "../../common/currency";

// ─── Public input shape ───────────────────────────────────────────────

export interface PurchaseOrderPdfInput {
  tenant: { name: string; address_lines?: string[]; email?: string; phone?: string };
  po: {
    code: string;
    created_at: Date;
    expected_at?: Date | null;
    currency_code: string;
    subtotal_cents: number;
    tax_cents: number;
    shipping_cents: number;
    total_cents: number;
    notes?: string | null;
  };
  supplier: {
    name: string;
    contact_name?: string | null;
    contact_email?: string | null;
    address_lines?: string[];
  };
  branch: {
    name: string;
    address_lines?: string[];
  };
  lines: Array<{
    sku?: string | null;
    product_name: string;
    qty_ordered: number;
    unit_cost_cents: number;
    line_total_cents: number;
  }>;
}

// ─── Page geometry (A4, points) ───────────────────────────────────────

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN_X = 48;
const MARGIN_TOP = 56;
const MARGIN_BOTTOM = 56;

// Soft palette echoing the design tokens (warm, calm). pdf-lib only takes
// 0..1 rgb so we encode the hexes here.
const COLOR_INK = rgb(0.102, 0.090, 0.078); // ~ #1A1714
const COLOR_MUTED = rgb(0.540, 0.516, 0.470); // ~ #8A8478
const COLOR_RULE = rgb(0.910, 0.894, 0.866); // ~ #E8E4DD

// ─── Public entry point ──────────────────────────────────────────────

/**
 * Render the PO into a single-page A4 PDF. Returns a Node Buffer suitable
 * for shipping as an email attachment.
 *
 * Multi-page rendering is intentionally deferred — even 50-line POs fit on
 * one page given our row height. If a tenant ever exceeds the table area we
 * truncate visually with a "…and N more lines" footer (TODO: real pagination
 * when sales feedback demands it).
 */
export async function renderPurchaseOrderPdf(input: PurchaseOrderPdfInput): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Purchase Order ${input.po.code}`);
  doc.setProducer("Madar POS");
  doc.setCreator("Madar API");
  doc.setCreationDate(new Date());

  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const helvItalic = await doc.embedFont(StandardFonts.HelveticaOblique);

  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const ctx: RenderCtx = { page, helv, helvBold, helvItalic, input, y: PAGE_HEIGHT - MARGIN_TOP };

  drawTopBand(ctx);
  ctx.y -= 8;
  drawDivider(ctx);
  ctx.y -= 22;
  drawAddressColumns(ctx);
  ctx.y -= 18;
  drawDivider(ctx);
  ctx.y -= 14;
  drawLinesTable(ctx);
  ctx.y -= 6;
  drawTotalsBlock(ctx);
  drawNotes(ctx);
  drawFooter(ctx);

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

// ─── Internals ───────────────────────────────────────────────────────

interface RenderCtx {
  page: PDFPage;
  helv: PDFFont;
  helvBold: PDFFont;
  helvItalic: PDFFont;
  input: PurchaseOrderPdfInput;
  /** Current cursor — y position from page top where the next block draws. */
  y: number;
}

function drawTopBand(ctx: RenderCtx): void {
  const { page, helv, helvBold, input } = ctx;
  const leftX = MARGIN_X;
  const rightX = PAGE_WIDTH - MARGIN_X;

  // ─── Left: tenant ────────────────────────────────────────────────
  const tenantName = coerceToWinAnsi(input.tenant.name);
  page.drawText(tenantName, { x: leftX, y: ctx.y, size: 18, font: helvBold, color: COLOR_INK });

  let leftCursor = ctx.y - 16;
  const contactLines: string[] = [];
  for (const line of input.tenant.address_lines ?? []) contactLines.push(line);
  if (input.tenant.email) contactLines.push(input.tenant.email);
  if (input.tenant.phone) contactLines.push(input.tenant.phone);
  for (const line of contactLines.slice(0, 4)) {
    page.drawText(coerceToWinAnsi(line), { x: leftX, y: leftCursor, size: 9, font: helv, color: COLOR_MUTED });
    leftCursor -= 11;
  }

  // ─── Right: PO label + meta ──────────────────────────────────────
  const labelText = "PURCHASE ORDER";
  const labelW = helv.widthOfTextAtSize(labelText, 9);
  page.drawText(labelText, {
    x: rightX - labelW,
    y: ctx.y + 4,
    size: 9,
    font: helv,
    color: COLOR_MUTED,
  });

  const codeText = coerceToWinAnsi(input.po.code);
  const codeW = helvBold.widthOfTextAtSize(codeText, 14);
  page.drawText(codeText, {
    x: rightX - codeW,
    y: ctx.y - 14,
    size: 14,
    font: helvBold,
    color: COLOR_INK,
  });

  const issuedLine = `Issued: ${formatDate(input.po.created_at)}`;
  const issuedW = helv.widthOfTextAtSize(issuedLine, 9);
  page.drawText(issuedLine, {
    x: rightX - issuedW,
    y: ctx.y - 30,
    size: 9,
    font: helv,
    color: COLOR_MUTED,
  });

  if (input.po.expected_at) {
    const expectedLine = `Expected: ${formatDate(input.po.expected_at)}`;
    const expectedW = helv.widthOfTextAtSize(expectedLine, 9);
    page.drawText(expectedLine, {
      x: rightX - expectedW,
      y: ctx.y - 42,
      size: 9,
      font: helv,
      color: COLOR_MUTED,
    });
  }

  // Advance below the taller of the two columns.
  const leftBottom = leftCursor;
  const rightBottom = ctx.y - (input.po.expected_at ? 42 : 30) - 4;
  ctx.y = Math.min(leftBottom, rightBottom);
}

function drawAddressColumns(ctx: RenderCtx): void {
  const { page, helv, helvBold, input } = ctx;
  const leftX = MARGIN_X;
  const rightX = PAGE_WIDTH / 2 + 12;
  const startY = ctx.y;

  page.drawText("BILL TO / SUPPLIER", {
    x: leftX,
    y: startY,
    size: 8,
    font: helv,
    color: COLOR_MUTED,
  });
  page.drawText(coerceToWinAnsi(input.supplier.name), {
    x: leftX,
    y: startY - 14,
    size: 11,
    font: helvBold,
    color: COLOR_INK,
  });
  let leftCursor = startY - 26;
  if (input.supplier.contact_name) {
    page.drawText(coerceToWinAnsi(`Attn: ${input.supplier.contact_name}`), {
      x: leftX,
      y: leftCursor,
      size: 9,
      font: helv,
      color: COLOR_INK,
    });
    leftCursor -= 11;
  }
  for (const line of (input.supplier.address_lines ?? []).slice(0, 4)) {
    page.drawText(coerceToWinAnsi(line), { x: leftX, y: leftCursor, size: 9, font: helv, color: COLOR_MUTED });
    leftCursor -= 11;
  }
  if (input.supplier.contact_email) {
    page.drawText(input.supplier.contact_email, {
      x: leftX,
      y: leftCursor,
      size: 9,
      font: helv,
      color: COLOR_MUTED,
    });
    leftCursor -= 11;
  }

  page.drawText("SHIP TO / BRANCH", {
    x: rightX,
    y: startY,
    size: 8,
    font: helv,
    color: COLOR_MUTED,
  });
  page.drawText(coerceToWinAnsi(input.branch.name), {
    x: rightX,
    y: startY - 14,
    size: 11,
    font: helvBold,
    color: COLOR_INK,
  });
  let rightCursor = startY - 26;
  for (const line of (input.branch.address_lines ?? []).slice(0, 4)) {
    page.drawText(coerceToWinAnsi(line), { x: rightX, y: rightCursor, size: 9, font: helv, color: COLOR_MUTED });
    rightCursor -= 11;
  }

  ctx.y = Math.min(leftCursor, rightCursor) - 4;
}

function drawLinesTable(ctx: RenderCtx): void {
  const { page, helv, helvBold, input } = ctx;
  const currency = input.po.currency_code;

  // Column geometry: SKU | Item | Qty | Unit | Total
  const cols = {
    sku: { x: MARGIN_X, w: 70, align: "left" as const },
    item: { x: MARGIN_X + 76, w: 220, align: "left" as const },
    qty: { x: MARGIN_X + 302, w: 40, align: "right" as const },
    unit: { x: MARGIN_X + 350, w: 70, align: "right" as const },
    total: { x: MARGIN_X + 428, w: 71, align: "right" as const },
  };
  const headerY = ctx.y;
  drawCell(page, "SKU", cols.sku, headerY, helvBold, 9, COLOR_MUTED);
  drawCell(page, "Item", cols.item, headerY, helvBold, 9, COLOR_MUTED);
  drawCell(page, "Qty", cols.qty, headerY, helvBold, 9, COLOR_MUTED);
  drawCell(page, "Unit", cols.unit, headerY, helvBold, 9, COLOR_MUTED);
  drawCell(page, "Total", cols.total, headerY, helvBold, 9, COLOR_MUTED);

  ctx.y -= 6;
  page.drawLine({
    start: { x: MARGIN_X, y: ctx.y },
    end: { x: PAGE_WIDTH - MARGIN_X, y: ctx.y },
    thickness: 0.5,
    color: COLOR_RULE,
  });
  ctx.y -= 12;

  // Row height + maximum rows that comfortably fit.
  const ROW_H = 14;
  const tableBottom = MARGIN_BOTTOM + 130; // reserve space for totals + footer
  const maxRows = Math.max(0, Math.floor((ctx.y - tableBottom) / ROW_H));
  const visibleLines = input.lines.slice(0, maxRows);

  for (const line of visibleLines) {
    const rowY = ctx.y;
    drawCell(page, line.sku ?? "—", cols.sku, rowY, helv, 9, COLOR_INK);
    drawCell(page, truncate(line.product_name, 38), cols.item, rowY, helv, 9, COLOR_INK);
    drawCell(page, String(line.qty_ordered), cols.qty, rowY, helv, 9, COLOR_INK);
    drawCell(page, formatMoney(currency, line.unit_cost_cents), cols.unit, rowY, helv, 9, COLOR_INK);
    drawCell(page, formatMoney(currency, line.line_total_cents), cols.total, rowY, helvBold, 9, COLOR_INK);
    ctx.y -= ROW_H;
  }

  if (input.lines.length > visibleLines.length) {
    const overflow = input.lines.length - visibleLines.length;
    page.drawText(`…and ${overflow} more line${overflow === 1 ? "" : "s"}`, {
      x: MARGIN_X,
      y: ctx.y,
      size: 8,
      font: helv,
      color: COLOR_MUTED,
    });
    ctx.y -= ROW_H;
  }

  ctx.y -= 4;
  page.drawLine({
    start: { x: MARGIN_X, y: ctx.y },
    end: { x: PAGE_WIDTH - MARGIN_X, y: ctx.y },
    thickness: 0.5,
    color: COLOR_RULE,
  });
}

function drawTotalsBlock(ctx: RenderCtx): void {
  const { page, helv, helvBold, input } = ctx;
  const currency = input.po.currency_code;
  const rightEdge = PAGE_WIDTH - MARGIN_X;
  const labelX = rightEdge - 200;
  const valueX = rightEdge;

  ctx.y -= 14;
  drawTotalRow(page, "Subtotal", formatMoney(currency, input.po.subtotal_cents), labelX, valueX, ctx.y, helv, 9, COLOR_INK);
  ctx.y -= 12;
  drawTotalRow(page, "Tax", formatMoney(currency, input.po.tax_cents), labelX, valueX, ctx.y, helv, 9, COLOR_INK);
  ctx.y -= 12;
  drawTotalRow(page, "Shipping", formatMoney(currency, input.po.shipping_cents), labelX, valueX, ctx.y, helv, 9, COLOR_INK);
  ctx.y -= 14;
  page.drawLine({
    start: { x: labelX, y: ctx.y + 4 },
    end: { x: rightEdge, y: ctx.y + 4 },
    thickness: 0.5,
    color: COLOR_RULE,
  });
  ctx.y -= 4;
  drawTotalRow(page, "Total", formatMoney(currency, input.po.total_cents), labelX, valueX, ctx.y, helvBold, 12, COLOR_INK);
  ctx.y -= 18;
}

function drawNotes(ctx: RenderCtx): void {
  const { page, helv, helvBold, helvItalic, input } = ctx;
  if (!input.po.notes) return;
  // Leave at least 50pt above the footer.
  if (ctx.y < MARGIN_BOTTOM + 60) return;
  page.drawText("Notes", {
    x: MARGIN_X,
    y: ctx.y,
    size: 9,
    font: helvBold,
    color: COLOR_MUTED,
  });
  ctx.y -= 12;
  const maxWidth = PAGE_WIDTH - MARGIN_X * 2;
  const wrapped = wrapText(coerceToWinAnsi(input.po.notes), helvItalic, 9, maxWidth);
  for (const line of wrapped.slice(0, 4)) {
    page.drawText(line, { x: MARGIN_X, y: ctx.y, size: 9, font: helvItalic, color: COLOR_INK });
    ctx.y -= 11;
  }
  // helv reference kept to keep import lint quiet in callers that strip italic
  void helv;
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
  const pageLabel = "Page 1";
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

function drawTotalRow(
  page: PDFPage,
  label: string,
  value: string,
  labelX: number,
  valueX: number,
  y: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
): void {
  page.drawText(label, { x: labelX, y, size, font, color: COLOR_MUTED });
  const valueW = font.widthOfTextAtSize(value, size);
  page.drawText(value, { x: valueX - valueW, y, size, font, color });
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Format an integer minor-units amount as `{CCY} {N.NNN…}`. Integer
 * arithmetic only (NOT float division) to avoid the float-cents pitfall
 * called out in CLAUDE.md, with the currency's REAL minor-unit count
 * (KWD=3, JPY=0) via the shared lookup.
 */
export function formatMoney(currencyCode: string, cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const digits = currencyMinorUnits(currencyCode);
  const div = 10 ** digits;
  const formatted =
    digits === 0
      ? Math.floor(abs).toLocaleString("en-US")
      : `${Math.floor(abs / div).toLocaleString("en-US")}.${(abs % div)
          .toString()
          .padStart(digits, "0")}`;
  return `${currencyCode} ${negative ? "-" : ""}${formatted}`;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

/**
 * pdf-lib's StandardFonts cover WinAnsi only. Any code point outside that
 * range (Arabic, emoji, CJK) throws at `drawText` time. Rather than crashing
 * the email job on a stray Arabic supplier name, we pre-coerce the string:
 * non-WinAnsi chars become `?`. The caller should not rely on this for
 * faithful Arabic rendering — see the file header.
 */
function coerceToWinAnsi(s: string): string {
  // WinAnsiEncoding is roughly: 0x20-0x7E (ASCII printable), plus 0xA0-0xFF
  // (Latin-1), plus a handful in 0x80-0x9F. We also allow common typographic
  // chars (…, em/en dash, smart quotes) that pdf-lib's mapping handles.
  // Anything else → "?".
  const allowed = /[\x20-\x7E\xA0-\xFF–—‘’“”…]/;
  let out = "";
  for (const ch of s) {
    if (allowed.test(ch)) out += ch;
    else out += "?";
  }
  return out;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}
