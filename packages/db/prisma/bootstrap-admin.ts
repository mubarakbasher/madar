import "./env-prelude";
import { randomBytes } from "node:crypto";
import argon2 from "argon2";
import { adminPrisma } from "../src/admin";

const prisma = adminPrisma;

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function toBase32(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(
      `Missing env ${name}. Pass it via -e ${name}=... on the docker compose run, e.g.\n  -e BOOTSTRAP_ADMIN_EMAIL=admin@yourco.com`,
    );
  }
  return v.trim();
}

async function main() {
  const email = requireEnv("BOOTSTRAP_ADMIN_EMAIL").toLowerCase();
  const password = requireEnv("BOOTSTRAP_ADMIN_PASSWORD");
  const name = requireEnv("BOOTSTRAP_ADMIN_NAME");
  const totpSecret = process.env.BOOTSTRAP_ADMIN_TOTP_SECRET?.trim() || toBase32(randomBytes(20));

  if (password.length < 12) {
    throw new Error("BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters.");
  }

  const passwordHash = await argon2.hash(password);

  const existing = await prisma.platformUser.findUnique({ where: { email } });

  const user = await prisma.platformUser.upsert({
    where: { email },
    update: {
      name,
      role: "owner",
      mfa_enabled: true,
    },
    create: {
      email,
      password_hash: passwordHash,
      name,
      role: "owner",
      mfa_secret: totpSecret,
      mfa_enabled: true,
    },
  });

  const otpauthUrl = `otpauth://totp/Madar:${encodeURIComponent(email)}?secret=${user.mfa_secret}&issuer=Madar&algorithm=SHA1&digits=6&period=30`;

  console.log("");
  console.log(existing ? "✓ Super-admin updated:" : "✓ Super-admin created:");
  console.log(`    email: ${user.email}`);
  console.log(`    name:  ${user.name}`);
  console.log(`    role:  ${user.role}`);
  console.log("");
  if (existing) {
    console.log("ℹ  TOTP secret preserved from previous bootstrap (re-scanning is unnecessary).");
    console.log(`   Current secret: ${user.mfa_secret}`);
  } else {
    console.log("📱 Scan this otpauth URL into your authenticator app (1Password, Authy, Google Authenticator, etc.):");
    console.log("");
    console.log(`    ${otpauthUrl}`);
    console.log("");
    console.log("   Or enter the secret manually:");
    console.log(`    ${user.mfa_secret}`);
  }
  console.log("");
  console.log("Sign in at https://<your-admin-host>/login with this email + the password you set + the 6-digit TOTP code.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("✗ Bootstrap failed:", err.message ?? err);
    await prisma.$disconnect();
    process.exit(1);
  });
