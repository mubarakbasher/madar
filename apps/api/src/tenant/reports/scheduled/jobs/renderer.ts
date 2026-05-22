/**
 * Render the tabular `ReportRunResult` into either a CSV string or a PDF
 * Buffer. v1 floor: CSV for all kinds; PDF is a basic table layout for any
 * kind. Slice 4 (tax) ships its own dedicated tax-PDF renderer; if the
 * scheduler is invoking that slice, callers should prefer Slice 4's renderer
 * by intercepting the kind=tax path. For now we ship a single uniform
 * implementation — it's adequate for daily emails and avoids the maintenance
 * cost of three diverging PDF templates.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { ReportRunResult } from "./report-runner";

export function renderCsv(report: ReportRunResult): string {
  // Excel-friendly: CRLF line endings, double-quoted cells with embedded
  // quotes doubled. Bare BOM prefix so Excel auto-detects UTF-8 when the
  // payload contains Arabic.
  const BOM = "﻿";
  const lines = report.rows.map((row) => row.map(escapeCell).join(","));
  return BOM + lines.join("\r\n") + "\r\n";
}

function escapeCell(value: string): string {
  const s = value == null ? "" : String(value);
  if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Minimal PDF: title at top + simple table grid. Deliberately small surface
 * area: pdf-lib doesn't ship a layout engine, so the table is hand-rolled
 * with fixed-width Courier columns. Adequate for the v1 floor; tax/P&L can
 * upgrade to dedicated renderers later without touching this file.
 */
export async function renderPdf(report: ReportRunResult): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const monoFont = await doc.embedFont(StandardFonts.Courier);
  const titleFont = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([595, 842]); // A4 portrait, points
  const margin = 48;
  let y = page.getHeight() - margin;

  page.drawText(report.title, {
    x: margin,
    y,
    size: 18,
    font: titleFont,
    color: rgb(0.1, 0.09, 0.08),
  });
  y -= 22;
  page.drawText(report.periodLabel, {
    x: margin,
    y,
    size: 11,
    font,
    color: rgb(0.36, 0.34, 0.3),
  });
  y -= 28;

  // Compute fixed column widths from header row, naive but predictable.
  const header = report.rows[0] ?? [];
  const dataRows = report.rows.slice(1);
  if (header.length === 0) {
    return Buffer.from(await doc.save());
  }

  const usableWidth = page.getWidth() - margin * 2;
  const colWidth = Math.max(40, Math.floor(usableWidth / header.length));
  const rowHeight = 14;

  const drawRow = (row: string[], bold: boolean) => {
    if (y < margin + rowHeight) {
      page = doc.addPage([595, 842]);
      y = page.getHeight() - margin;
    }
    row.forEach((cell, i) => {
      const text = truncate(String(cell ?? ""), Math.floor(colWidth / 6.5));
      page.drawText(text, {
        x: margin + i * colWidth,
        y,
        size: 9,
        font: bold ? titleFont : monoFont,
        color: rgb(0.1, 0.09, 0.08),
      });
    });
    y -= rowHeight;
  };

  drawRow(header, true);
  // Underline.
  page.drawLine({
    start: { x: margin, y: y + 10 },
    end: { x: page.getWidth() - margin, y: y + 10 },
    thickness: 0.5,
    color: rgb(0.84, 0.79, 0.71),
  });

  for (const row of dataRows) {
    drawRow(row, false);
  }

  return Buffer.from(await doc.save());
}

function truncate(s: string, max: number): string {
  if (max <= 0) return "";
  if (s.length <= max) return s;
  return s.slice(0, Math.max(1, max - 1)) + "…";
}
