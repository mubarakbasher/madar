-- Phase 1.5b + 1.5c — user auth extras.
--
-- Adds:
--   * email_verified + token columns for the verify-email flow.
--   * password_reset token columns for the forgot/reset flow.
--   * mfa_enabled flag (mfa_secret already existed but was effectively dead).
--   * mfa_recovery_codes_hash[] for the recovery-code single-use system.
--
-- Tokens are stored as SHA-256 hex hashes so a DB compromise can't issue valid
-- reset links. Raw tokens travel only in URL + email body. Recovery codes are
-- argon2id-hashed since they're user-typed and we don't want timing leakage.
--
-- No RLS change — `users` is already an RLS-scoped table; the new columns
-- inherit the existing tenant_isolation policy automatically.

ALTER TABLE "users"
  ADD COLUMN "email_verified" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "email_verification_token_hash" TEXT,
  ADD COLUMN "email_verification_expires_at" TIMESTAMPTZ,
  ADD COLUMN "password_reset_token_hash" TEXT,
  ADD COLUMN "password_reset_expires_at" TIMESTAMPTZ,
  ADD COLUMN "mfa_enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "mfa_recovery_codes_hash" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Lookups by token hash need to be fast; partial indexes skip rows where the
-- token is NULL (the common case after consumption).
CREATE INDEX "users_email_verification_token_hash_idx"
  ON "users" ("email_verification_token_hash")
  WHERE "email_verification_token_hash" IS NOT NULL;

CREATE INDEX "users_password_reset_token_hash_idx"
  ON "users" ("password_reset_token_hash")
  WHERE "password_reset_token_hash" IS NOT NULL;
