import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";

/**
 * Generate a tiny JPEG buffer (white square). Real bytes, valid magic bytes,
 * survives file-type detection.
 */
export async function tinyJpegBuffer(): Promise<Buffer> {
  return sharp({
    create: {
      width: 100,
      height: 100,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .jpeg({ quality: 80 })
    .toBuffer();
}

export async function tinyPngBuffer(): Promise<Buffer> {
  return sharp({
    create: {
      width: 100,
      height: 100,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

/**
 * Minimal valid PDF — magic bytes + EOF marker. file-type recognizes the
 * %PDF- prefix.
 */
export function tinyPdfBuffer(): Buffer {
  return Buffer.from(
    "%PDF-1.4\n1 0 obj\n<<>>\nendobj\nxref\n0 1\n0000000000 65535 f\ntrailer\n<<>>\nstartxref\n9\n%%EOF\n",
    "latin1",
  );
}

/**
 * Generate a large JPEG (>5MB). Approach: ask sharp to produce a 5000x5000 noise
 * image at quality 100, which reliably yields ~6+ MB.
 */
export async function oversizeJpegBuffer(): Promise<Buffer> {
  // Random noise (3 channels uint8) — compresses poorly so we hit >5MB easily.
  const w = 4000;
  const h = 4000;
  const data = Buffer.alloc(w * h * 3);
  for (let i = 0; i < data.length; i++) data[i] = Math.floor(Math.random() * 256);
  return sharp(data, { raw: { width: w, height: h, channels: 3 } })
    .jpeg({ quality: 100 })
    .toBuffer();
}

/**
 * Create a unique temporary STORAGE_ROOT for a spec. Returns the path; caller
 * is responsible for cleanup via `fs.rm(root, { recursive: true, force: true })`.
 */
export async function makeStorageRoot(): Promise<string> {
  const root = path.join(os.tmpdir(), `madar-storage-${randomUUID().slice(0, 8)}`);
  await fs.mkdir(root, { recursive: true });
  process.env.STORAGE_ROOT = root;
  return root;
}

export async function removeStorageRoot(root: string): Promise<void> {
  await fs.rm(root, { recursive: true, force: true });
}
