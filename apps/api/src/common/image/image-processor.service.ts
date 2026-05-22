import { Injectable } from "@nestjs/common";
import sharp from "sharp";

export type SupportedMime = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

export interface ProcessedFile {
  buffer: Buffer;
  ext: "jpg" | "png" | "webp" | "pdf";
  mime: SupportedMime;
}

/**
 * Image-processing pipeline:
 *   - Apply EXIF orientation, then strip metadata (privacy: location, device).
 *   - Resize long edge to ≤2000px (preserve aspect, never upscale).
 *   - Re-encode JPG q=85 / PNG lossless / WEBP q=85.
 * PDFs pass through unchanged — we don't re-render PDFs.
 */
@Injectable()
export class ImageProcessor {
  async process(buffer: Buffer, mime: SupportedMime): Promise<ProcessedFile> {
    if (mime === "application/pdf") {
      return { buffer, ext: "pdf", mime };
    }

    const pipeline = sharp(buffer, { failOn: "error" })
      .rotate() // apply EXIF orientation then drop the tag
      .resize({
        width: 2000,
        height: 2000,
        fit: "inside",
        withoutEnlargement: true,
      });

    if (mime === "image/jpeg") {
      const out = await pipeline.jpeg({ quality: 85, mozjpeg: false }).toBuffer();
      return { buffer: out, ext: "jpg", mime };
    }
    if (mime === "image/png") {
      const out = await pipeline.png({ compressionLevel: 9 }).toBuffer();
      return { buffer: out, ext: "png", mime };
    }
    if (mime === "image/webp") {
      const out = await pipeline.webp({ quality: 85 }).toBuffer();
      return { buffer: out, ext: "webp", mime };
    }
    throw new Error(`Unsupported MIME for image processor: ${mime}`);
  }
}
