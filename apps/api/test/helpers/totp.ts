import { authenticator } from "otplib";

/**
 * Compute the current valid TOTP 6-digit code for a base32 secret. Mirrors
 * AdminMfaService defaults: SHA1, 30s step, 6 digits, ±1 window.
 */
export function currentTotp(secretBase32: string): string {
  authenticator.options = { window: 1, step: 30, digits: 6 };
  return authenticator.generate(secretBase32);
}
