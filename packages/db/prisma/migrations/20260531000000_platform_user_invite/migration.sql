-- Platform user invite + active status columns
ALTER TABLE "platform_users" ADD COLUMN "invite_token_hash" TEXT;
ALTER TABLE "platform_users" ADD COLUMN "invite_expires_at" TIMESTAMPTZ;
ALTER TABLE "platform_users" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;
