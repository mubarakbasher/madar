import { Injectable, Logger } from "@nestjs/common";
import { Resend } from "resend";
import { loadEnv } from "../../env";
import type { EmailMessage, EmailProvider } from "./email.types";

/**
 * Production email provider. Lazy-inits the Resend SDK on first send so that
 * we don't construct the client (and therefore don't require RESEND_API_KEY)
 * in environments where EMAIL_PROVIDER=disk.
 */
@Injectable()
export class ResendEmailProvider implements EmailProvider {
  private readonly logger = new Logger(ResendEmailProvider.name);
  private client: Resend | null = null;

  private getClient(): Resend {
    if (!this.client) {
      const env = loadEnv();
      if (!env.RESEND_API_KEY) {
        throw new Error("RESEND_API_KEY is required when EMAIL_PROVIDER=resend");
      }
      this.client = new Resend(env.RESEND_API_KEY);
    }
    return this.client;
  }

  async send(message: EmailMessage): Promise<{ id: string }> {
    const res = await this.getClient().emails.send({
      from: message.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      headers: {
        "X-Madar-Template": message.template,
        "X-Madar-Locale": message.locale,
      },
      // Resend's SDK accepts `attachments` as `{ filename, content }` where
      // `content` is a Buffer or base64 string — passing the Buffer directly.
      ...(message.attachments && message.attachments.length > 0
        ? {
            attachments: message.attachments.map((a) => ({
              filename: a.filename,
              content: a.content,
              contentType: a.contentType,
            })),
          }
        : {}),
    });
    if (res.error) {
      this.logger.warn(`Resend rejected: ${res.error.message}`);
      throw new Error(`resend_send_failed: ${res.error.message}`);
    }
    return { id: res.data?.id ?? "" };
  }
}
