/**
 * Shared constants + payload shape for the send-PO-email job.
 *
 * Lives in its own file so the producer (the future PO controller/service)
 * can import the queue name + payload type without dragging in the BullMQ
 * worker code path. Keeping this file Prisma-free + Nest-free also lets the
 * tenant web app type-check against the same shape if we ever stand up a
 * shared schema package for queue payloads.
 */

export const SEND_PO_EMAIL_QUEUE = "send-po-email";

/** Logical job name used inside the queue. Future jobs on the same queue
 * (e.g. resend, cancellation notice) can pick a different name and share the
 * worker. */
export const SEND_PO_EMAIL_JOB = "send-po-email";

export interface SendPoEmailJobPayload {
  /** Tenant the PO belongs to; the processor filters by this to keep
   *  cross-tenant safety explicit even though the job uses `adminPrisma`. */
  tenantId: string;
  purchaseOrderId: string;
  /** Optional user that kicked off the send (for the audit row, eventually). */
  triggeredByUserId?: string;
  /** Override the recipient. Defaults to supplier.contact_email when omitted. */
  toEmail?: string;
}
