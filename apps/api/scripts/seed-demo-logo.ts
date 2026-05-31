/**
 * Dev helper: give the demo tenant a logo so the receipt shows it out of the
 * box. Renders a simple PNG from an SVG via sharp, writes it to the same
 * storage path the upload endpoint uses (tenants/{id}/branding/logo.png), and
 * sets tenants.logo_url. Run from apps/api so the storage root resolves to
 * apps/api/var/storage. Real tenants upload their own via Settings → Business.
 *
 *   SEED_TENANT_ID=<uuid> pnpm exec tsx scripts/seed-demo-logo.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { adminPrisma } from "@madar/db";

async function main() {
  const tenantId = process.env.SEED_TENANT_ID;
  if (!tenantId) throw new Error("SEED_TENANT_ID env var is required");

  const tenant = await adminPrisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new Error(`tenant ${tenantId} not found`);

  const label = tenant.name || "Madar";
  const initial = label.trim().charAt(0).toUpperCase() || "M";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="160">
    <rect width="100%" height="100%" fill="#ffffff"/>
    <circle cx="68" cy="80" r="44" fill="#C96442"/>
    <text x="68" y="96" font-size="48" font-family="Georgia, serif" fill="#ffffff" text-anchor="middle">${initial}</text>
    <text x="132" y="92" font-size="34" font-family="Georgia, serif" fill="#1A1714">${label}</text>
  </svg>`;

  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const rel = `tenants/${tenantId}/branding/logo.png`;
  // Storage root is apps/api/var/storage (this script lives in apps/api/scripts).
  const root = path.resolve(__dirname, "..", "var", "storage");
  const abs = path.join(root, ...rel.split("/"));
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, png);

  await adminPrisma.tenant.update({ where: { id: tenantId }, data: { logo_url: rel } });
  console.log(`seeded logo for "${label}": ${rel}`);
  console.log(`  file: ${abs} (${png.length} bytes)`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
