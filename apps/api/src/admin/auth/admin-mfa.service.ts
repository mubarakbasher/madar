import { Injectable } from "@nestjs/common";
import { authenticator } from "otplib";

/**
 * Wrapper around otplib for TOTP verification. Defaults match what the seed
 * uses (SHA1, 6 digits, 30s period — see packages/db/prisma/seed.ts:70). A ±1
 * step skew tolerates clock drift between the admin's device and the server.
 */
@Injectable()
export class AdminMfaService {
  constructor() {
    authenticator.options = {
      window: 1,
      step: 30,
      digits: 6,
    };
  }

  /**
   * Verify a 6-digit TOTP code against a base32-encoded secret. Returns true
   * if the code is valid within ±1 30s window.
   */
  verify(code: string, secretBase32: string): boolean {
    if (!/^\d{6}$/.test(code)) return false;
    try {
      return authenticator.verify({ token: code, secret: secretBase32 });
    } catch {
      return false;
    }
  }

  /**
   * Generate the current valid TOTP code for a secret. Test-only helper —
   * production code never needs to compute the code server-side.
   */
  generateForTest(secretBase32: string): string {
    return authenticator.generate(secretBase32);
  }
}
