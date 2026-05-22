import { Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import argon2 from "argon2";
import { authenticator } from "otplib";

/**
 * Wraps otplib + recovery-code generation/verification for the tenant MFA
 * flow. The admin app uses its own `AdminMfaService` with the same otplib
 * defaults — they're intentionally duplicated rather than shared to keep
 * realm boundaries clean.
 */
@Injectable()
export class MfaService {
  constructor() {
    authenticator.options = { window: 1, step: 30, digits: 6 };
  }

  /** Generate a fresh base32-encoded TOTP secret. */
  generateSecret(): string {
    return authenticator.generateSecret();
  }

  /**
   * Build the `otpauth://` provisioning URI used to render a QR code.
   * `label` is shown in the authenticator app (typically the user's email),
   * `issuer` becomes the row's heading.
   */
  keyUri(p: { secret: string; label: string; issuer: string }): string {
    return authenticator.keyuri(p.label, p.issuer, p.secret);
  }

  /** Verify a 6-digit TOTP code against a base32-encoded secret. */
  verifyTotp(code: string, secretBase32: string): boolean {
    if (!/^\d{6}$/.test(code)) return false;
    try {
      return authenticator.verify({ token: code, secret: secretBase32 });
    } catch {
      return false;
    }
  }

  /**
   * Generate N random recovery codes as `xxxx-xxxx` (8 base32 chars total,
   * lowercase, no padding) — easy to read, easy to type, hard to guess.
   * 10 codes × ~40 bits of entropy each = comfortably out of brute-force range
   * once they're behind the per-user 10/min rate limit.
   */
  generateRecoveryCodes(count = 10): string[] {
    const out: string[] = [];
    for (let i = 0; i < count; i++) out.push(this.makeCode());
    return out;
  }

  private makeCode(): string {
    // Charset excludes 0/1/o/l for easier human transcription.
    const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
    const buf = randomBytes(8);
    let raw = "";
    for (let i = 0; i < 8; i++) raw += alphabet[buf[i]! % alphabet.length];
    return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  }

  /** argon2id-hash each recovery code so the DB never stores the plaintext. */
  async hashRecoveryCodes(codes: string[]): Promise<string[]> {
    return Promise.all(codes.map((c) => argon2.hash(this.normalizeCode(c))));
  }

  /**
   * Find the index of a hash that matches the supplied recovery code.
   * Returns -1 when no match. Caller is responsible for removing that index
   * from the user's `mfa_recovery_codes_hash` array (single-use).
   */
  async findRecoveryCodeIndex(code: string, hashes: string[]): Promise<number> {
    const normalized = this.normalizeCode(code);
    for (let i = 0; i < hashes.length; i++) {
      try {
        if (await argon2.verify(hashes[i]!, normalized)) return i;
      } catch {
        /* malformed hash entry — skip */
      }
    }
    return -1;
  }

  /** A typed code is a recovery code if it matches xxxx-xxxx (with or without the dash). */
  isRecoveryCode(input: string): boolean {
    return /^[a-z0-9]{4}-?[a-z0-9]{4}$/i.test(input);
  }

  /** Normalize before hashing/verifying — lowercased, dashes stripped. */
  private normalizeCode(input: string): string {
    return input.toLowerCase().replace(/-/g, "");
  }
}
