-- Resubmit linkage + request-more-info columns for payment proofs
ALTER TABLE "payment_proofs" ADD COLUMN "previous_proof_id" UUID;
ALTER TABLE "payment_proofs" ADD COLUMN "info_requested_message" TEXT;
ALTER TABLE "payment_proofs" ADD COLUMN "info_requested_at" TIMESTAMPTZ;

CREATE INDEX "payment_proofs_previous_proof_id_idx" ON "payment_proofs" ("previous_proof_id");
