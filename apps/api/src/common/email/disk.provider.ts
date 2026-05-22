import { Injectable, Logger } from "@nestjs/common";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { loadEnv } from "../../env";
import type { EmailMessage, EmailProvider } from "./email.types";

/**
 * Disk-backed email provider used in dev + every Vitest run. Writes each
 * message as an `.eml`-ish file (RFC 822 headers + body) under
 * `${EMAIL_LOG_DIR}/`. No network. Tests inspect filenames + contents directly.
 *
 * Attachments — when present — are written into a separate `multipart/mixed`
 * outer envelope so the file is still a valid-ish `.eml`. Sibling files with
 * the same stem and the suffix `.attachment.{n}.{ext}` are also written so
 * tests can read the raw binary back without parsing MIME. The Resend provider
 * does the real thing in production.
 */
@Injectable()
export class DiskEmailProvider implements EmailProvider {
  private readonly logger = new Logger(DiskEmailProvider.name);

  async send(message: EmailMessage): Promise<{ id: string }> {
    const env = loadEnv();
    const id = randomUUID();
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const safeTo = message.to.replace(/[^a-z0-9._@-]/gi, "_");
    const stemTag = message.template === "raw" ? (message.rawTag ?? "raw") : message.template;
    const stem = `${ts}-${stemTag}-${safeTo}`;
    const filename = `${stem}.eml`;
    const dir = path.resolve(env.EMAIL_LOG_DIR);
    await fs.mkdir(dir, { recursive: true });
    const fullPath = path.join(dir, filename);

    const headerLines = [
      `Date: ${new Date().toUTCString()}`,
      `From: ${message.from}`,
      `To: ${message.to}`,
      `Subject: ${message.subject}`,
      `X-Madar-Template: ${message.template}`,
      `X-Madar-Locale: ${message.locale}`,
      `X-Madar-Message-Id: ${id}`,
      "MIME-Version: 1.0",
    ];

    const attachments = message.attachments ?? [];
    const altBoundary = "madar-alt-boundary";
    const mixedBoundary = "madar-mixed-boundary";

    const altPart = [
      `Content-Type: multipart/alternative; boundary=${altBoundary}`,
      "",
      `--${altBoundary}`,
      "Content-Type: text/plain; charset=utf-8",
      "",
      message.text,
      "",
      `--${altBoundary}`,
      "Content-Type: text/html; charset=utf-8",
      "",
      message.html,
      "",
      `--${altBoundary}--`,
      "",
    ].join("\n");

    let body: string;
    if (attachments.length === 0) {
      body = headerLines.concat([
        `Content-Type: multipart/alternative; boundary=${altBoundary}`,
        "",
        `--${altBoundary}`,
        "Content-Type: text/plain; charset=utf-8",
        "",
        message.text,
        "",
        `--${altBoundary}`,
        "Content-Type: text/html; charset=utf-8",
        "",
        message.html,
        "",
        `--${altBoundary}--`,
        "",
      ]).join("\n");
    } else {
      const attachmentParts: string[] = [];
      for (let i = 0; i < attachments.length; i++) {
        const att = attachments[i]!;
        // base64 encode in 76-column lines per RFC 2045.
        const b64 = att.content.toString("base64").replace(/(.{76})/g, "$1\n");
        attachmentParts.push(
          `--${mixedBoundary}`,
          `Content-Type: ${att.contentType}; name="${att.filename}"`,
          "Content-Transfer-Encoding: base64",
          `Content-Disposition: attachment; filename="${att.filename}"`,
          "",
          b64,
          "",
        );
        // Sibling raw file so tests can inspect without MIME parsing.
        const safeName = att.filename.replace(/[^a-z0-9._-]/gi, "_");
        await fs.writeFile(
          path.join(dir, `${stem}.attachment.${i}.${safeName}`),
          att.content,
        );
      }
      body = headerLines.concat([
        `Content-Type: multipart/mixed; boundary=${mixedBoundary}`,
        "",
        `--${mixedBoundary}`,
        altPart.trimEnd(),
        "",
        ...attachmentParts,
        `--${mixedBoundary}--`,
        "",
      ]).join("\n");
    }

    await fs.writeFile(fullPath, body, "utf8");
    this.logger.log(
      `disk-email wrote ${filename}${attachments.length ? ` (+${attachments.length} attachment)` : ""}`,
    );
    return { id };
  }
}
