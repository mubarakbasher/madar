import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { loadEnv } from "../env";

@Injectable()
export class CryptoService {
  private getKey(): Buffer {
    const hex = loadEnv().PLATFORM_BANK_ENCRYPTION_KEY;
    if (!hex) {
      throw new InternalServerErrorException({
        code: "encryption_key_missing",
        message: "PLATFORM_BANK_ENCRYPTION_KEY is required for bank account encryption",
      });
    }
    return Buffer.from(hex, "hex");
  }

  encrypt(plaintext: string): string {
    const key = this.getKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString("hex")}:${encrypted.toString("hex")}:${tag.toString("hex")}`;
  }

  decrypt(encrypted: string): string {
    const key = this.getKey();
    const [ivHex, cipherHex, tagHex] = encrypted.split(":");
    if (!ivHex || !cipherHex || !tagHex) {
      throw new InternalServerErrorException({
        code: "decrypt_failed",
        message: "Malformed encrypted value",
      });
    }
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return decipher.update(cipherHex, "hex", "utf8") + decipher.final("utf8");
  }
}
