// Deterministic decorative swatch per record id. The actual colors live in
// packages/ui/src/tokens.css (--swatch-1 … --swatch-8) per the tokens-only
// rule — this helper only picks WHICH token to use.

export const SWATCH_COUNT = 8;

export function swatchFromId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return `var(--swatch-${(Math.abs(hash) % SWATCH_COUNT) + 1})`;
}
