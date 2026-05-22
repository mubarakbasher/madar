import { Inject, Injectable, Logger } from "@nestjs/common";
import { loadEnv } from "../../env";
import {
  EMAIL_PROVIDER,
  type EmailAttachment,
  type EmailLocale,
  type EmailProvider,
  type SendInput,
} from "./email.types";
import { renderTemplate } from "./templates";

/**
 * Shape accepted by `EmailService.sendRaw()`. Unlike `SendInput`, this one
 * carries an already-rendered subject/html/text and may include binary
 * attachments. Used by transactional emails that are not bilingual-templated
 * — currently only the purchase-order PDF email.
 */
export interface SendRawInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  locale?: EmailLocale;
  attachments?: EmailAttachment[];
  /** Short label to help identify the message in disk-writer filenames. */
  tag?: string;
}

/**
 * Top-level email API used by the rest of the codebase. Knows how to:
 *   - render a typed template via `renderTemplate`
 *   - hand the rendered message to whichever provider is configured
 *
 * Locale resolution rule (centralized here so all senders use the same one):
 *   - tenant-context emails (welcome, trial_ending, payment_received, suspended)
 *     prefer the tenant's `default_locale` — one shop, one voice.
 *   - personal emails (admin_invite, future password_reset) prefer the
 *     recipient's `User.locale`.
 *
 * Callers pass `locale` already resolved — this comment documents the rule for
 * future call-site authors.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(@Inject(EMAIL_PROVIDER) private readonly provider: EmailProvider) {}

  async send(input: SendInput): Promise<{ id: string }> {
    const env = loadEnv();
    const rendered = renderTemplate(input.template, input.locale, input.vars as unknown as Record<string, unknown>);
    try {
      const { id } = await this.provider.send({
        to: input.to,
        from: env.EMAIL_FROM,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        template: input.template,
        locale: input.locale,
      });
      return { id };
    } catch (err) {
      this.logger.warn(`email send failed for template=${input.template}: ${(err as Error).message}`);
      throw err;
    }
  }

  /**
   * Render without sending — handy for tests, previews, and future admin
   * dev tools.
   */
  renderPreview(input: SendInput): { subject: string; html: string; text: string } {
    return renderTemplate(input.template, input.locale, input.vars as unknown as Record<string, unknown>);
  }

  /**
   * Send a one-off, non-templated transactional email with optional binary
   * attachments. Bypasses the template renderer entirely — the caller is
   * responsible for the rendered subject/body. Use only for flows that don't
   * fit the bilingual-template pattern (e.g. supplier PO PDFs, future signed
   * report exports).
   *
   * Why a separate method instead of overloading `send()`: keeping templated
   * emails strongly-typed at the call site is a big readability win for the
   * rest of the codebase. The few raw-email use cases get this escape hatch.
   */
  async sendRaw(input: SendRawInput): Promise<{ id: string }> {
    const env = loadEnv();
    const text = input.text ?? htmlToText(input.html);
    try {
      const { id } = await this.provider.send({
        to: input.to,
        from: env.EMAIL_FROM,
        subject: input.subject,
        html: input.html,
        text,
        template: "raw",
        locale: input.locale ?? "en",
        attachments: input.attachments,
        rawTag: input.tag,
      });
      return { id };
    } catch (err) {
      this.logger.warn(`raw email send failed (tag=${input.tag ?? "-"}): ${(err as Error).message}`);
      throw err;
    }
  }
}

/**
 * Fallback `text/plain` body for raw emails when the caller only supplied an
 * HTML body. Strips tags + collapses whitespace — good enough for the
 * notification emails that ride this path; not a general-purpose converter.
 */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function pickLocale(input: string | null | undefined): EmailLocale {
  return input === "ar" ? "ar" : "en";
}
