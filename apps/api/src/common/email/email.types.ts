export type EmailTemplate =
  | "welcome"
  | "trial_ending"
  | "payment_received"
  | "suspended"
  | "admin_invite"
  | "staff_invite"
  | "password_reset"
  | "email_verification"
  | "low_stock_alert"
  /**
   * Sentinel value used by `EmailService.sendRaw()` — these emails carry a
   * fully-rendered body (no template lookup) plus optional attachments, and
   * are tagged on the wire as `X-Madar-Template: raw`. Use sparingly: any
   * recurring transactional email belongs in a real template.
   */
  | "raw";

export type EmailLocale = "en" | "ar";

/**
 * A binary attachment carried by a transactional email (e.g. a PO PDF). Kept
 * intentionally small: filename + content buffer + MIME type. The disk
 * provider base64-encodes `content` into the multipart `.eml` body, and the
 * Resend provider hands it directly to the SDK.
 *
 * NOTE: attachments are reserved for `sendRaw()` — template-driven sends
 * (`send()`) never carry them. This keeps the template renderer free of
 * binary side-channels.
 */
export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface EmailMessage {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
  /** Logical template name; useful for the disk-writer filename. */
  template: EmailTemplate;
  /** The recipient's resolved locale at send-time. */
  locale: EmailLocale;
  /**
   * Optional binary attachments. Currently used by the PO-email job to ship
   * the generated PO PDF; future flows (invoices, receipts) can reuse the
   * same shape.
   */
  attachments?: EmailAttachment[];
  /**
   * Free-form tag used by the disk provider for filename hinting when the
   * email is not template-driven (template === "raw"). Ignored by Resend.
   */
  rawTag?: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<{ id: string }>;
}

export const EMAIL_PROVIDER = Symbol("EmailProvider");

// ─── Per-template var shapes ───────────────────────────────────────
// Each template has a typed `vars` payload; the union below keeps callers
// honest at compile time.

export interface WelcomeVars {
  tenantName: string;
  ownerName: string;
  trialEndsAt: string; // human-readable date
  ctaUrl: string;
}

export interface TrialEndingVars {
  tenantName: string;
  daysLeft: number;
  payInvoiceUrl: string;
}

export interface PaymentReceivedVars {
  tenantName: string;
  referenceCode: string;
  amountFormatted: string; // pre-formatted currency
  paidAt: string;
}

export interface SuspendedVars {
  tenantName: string;
  suspendedAt: string;
  payInvoiceUrl: string;
  dataExportEndsAt: string;
}

export interface AdminInviteVars {
  inviterName: string;
  inviteeName: string;
  acceptUrl: string;
  expiresAt: string;
}

/**
 * Vars for the tenant staff_invite email. Sent when an owner invites a new
 * teammate to their shop. The recipient follows `acceptUrl` to set a password
 * via the existing reset-password page; the email is therefore a glorified
 * reset-link plus context about who/why/what role.
 */
export interface StaffInviteVars {
  inviterName: string;
  inviteeName: string;
  tenantName: string;
  /** Role being assigned — surfaced verbatim in the body. */
  role: string;
  acceptUrl: string;
  expiresAt: string;
}

export interface PasswordResetVars {
  userName: string;
  tenantName: string;
  resetUrl: string;
  expiresInHours: number;
}

export interface EmailVerificationVars {
  userName: string;
  tenantName: string;
  verifyUrl: string;
  expiresInHours: number;
}

export interface LowStockAlertItem {
  /** Bilingual product name; the renderer picks the right one for `locale`. */
  name_i18n: { en: string; ar: string };
  sku: string;
  branch_code: string;
  qty_on_hand: number;
  reorder_point: number;
}

export interface LowStockAlertVars {
  tenantName: string;
  /** Already-rendered HTML rows for the item table. */
  itemsHtml: string;
  /** Plain-text rendering of the same list (one per line). */
  itemsText: string;
  itemCount: number;
  /** When the count exceeded the digest cap, this carries the overflow note;
   *  empty string otherwise. */
  overflowNote: string;
  inventoryUrl: string;
}

export type SendInput =
  | { template: "welcome"; to: string; locale: EmailLocale; vars: WelcomeVars }
  | { template: "trial_ending"; to: string; locale: EmailLocale; vars: TrialEndingVars }
  | { template: "payment_received"; to: string; locale: EmailLocale; vars: PaymentReceivedVars }
  | { template: "suspended"; to: string; locale: EmailLocale; vars: SuspendedVars }
  | { template: "admin_invite"; to: string; locale: EmailLocale; vars: AdminInviteVars }
  | { template: "staff_invite"; to: string; locale: EmailLocale; vars: StaffInviteVars }
  | { template: "password_reset"; to: string; locale: EmailLocale; vars: PasswordResetVars }
  | { template: "email_verification"; to: string; locale: EmailLocale; vars: EmailVerificationVars }
  | { template: "low_stock_alert"; to: string; locale: EmailLocale; vars: LowStockAlertVars };
