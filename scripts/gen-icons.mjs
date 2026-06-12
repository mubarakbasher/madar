// Regenerate the tenant PWA icons (apps/web/public/icons) from the Madar
// crescent-orbit mark. One-off tool — run after any change to the brand mark
// in packages/ui/src/logo.tsx, and keep the geometry here in sync with it.
//
//   node scripts/gen-icons.mjs
//
// Reuses sharp from apps/api (already a dependency there) — no root dep.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireFromApi = createRequire(path.join(ROOT, "apps", "api", "package.json"));
const sharp = requireFromApi("sharp");

const ACCENT = "#C8553D"; // --accent (light), packages/ui/src/tokens.css
const BG = "#FAF7F2"; // --bg

// Mark (48-unit viewBox) centered on a 96-unit canvas at 1.333x, so the
// glyph stays inside the maskable-icon safe zone (inner 80%).
const iconSvg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 96 96">
  <rect width="96" height="96" fill="${BG}"/>
  <g transform="translate(16 16) scale(1.3333)">
    <path d="M 24 9 A 15 15 0 1 0 39 24" fill="none" stroke="${ACCENT}" stroke-width="3" stroke-linecap="round"/>
    <circle cx="34.6" cy="13.4" r="4" fill="${ACCENT}"/>
    <circle cx="24" cy="24" r="5" fill="${ACCENT}"/>
  </g>
</svg>`;

const OUT_DIR = path.join(ROOT, "apps", "web", "public", "icons");

for (const size of [192, 512]) {
  const out = path.join(OUT_DIR, `icon-${size}.png`);
  await sharp(Buffer.from(iconSvg(size))).png().toFile(out);
  console.log(`wrote ${path.relative(ROOT, out)}`);
}
