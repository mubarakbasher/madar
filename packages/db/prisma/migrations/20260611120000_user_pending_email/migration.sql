-- Staged email change (audit M-5): the login email only swaps once the new
-- address confirms via the emailed token. Until then sign-in (and password
-- reset) keep using the verified old address.
ALTER TABLE "users" ADD COLUMN "pending_email" TEXT;
