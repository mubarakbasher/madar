# design-system.md — Visual Reference

The authoritative visual specification for both `apps/web` (tenant app) and `apps/admin` (super-admin app). Implemented in `packages/ui/`.

> **Source of truth:** the design tokens in `packages/ui/src/tokens.css` (+ the Tailwind mapping in `theme.css`). Components currently live per app (`apps/web`, `apps/admin`); extraction into `packages/ui` is planned once the visual-regression harness exists. This document describes intent; the code enforces it.

---

## 1. Design Principles

### Calm over busy
White space is a feature. If you can remove an element without losing meaning, remove it. Dashboards do not need 12 widgets above the fold.

### Warm, not cold
Off-white paper backgrounds and earthy accents. Never harsh pure white. Never corporate cobalt blue.

### Editorial typography
Treat text like a magazine: clear hierarchy, generous line-height, considered weight contrast. The display serif is part of the brand voice, not decoration.

### Soft confidence
Rounded corners — generous but not bubbly. Gentle shadows. No hard borders unless functional. The product should feel composed, not pleading for attention.

### Content first
The cashier's product grid, the owner's revenue number, the verifier's receipt image — these are the heroes. UI chrome recedes.

### Honest motion
Subtle, purposeful, never decorative. Motion guides attention; it doesn't show off.

---

## 2. Color Tokens

All colors live in `packages/ui/src/tokens.css` as CSS variables — that file is the single source of truth (ported 1:1 from the design prototype `docs/design/project/design-tokens.css`; change values only by ADR). **Never hardcode colors in components, and never invent token names: if it isn't in `tokens.css`, it doesn't exist.** An undefined `var(--…)` fails silently — transparent backgrounds, inherited text color, `currentColor` borders — which is exactly how ~430 broken references shipped before the 2026-07-22 sweep.

### Naming

The shipping scheme uses short semantic names (an earlier draft of this document described a `--color-*` scheme that never shipped — this table is the real vocabulary):

| Token | Role |
|---|---|
| `--bg` / `--bg-elev` / `--bg-sunk` / `--paper` | page background / raised cards / sunken wells / sidebar & paper surfaces |
| `--ink` / `--ink-2` / `--ink-3` / `--ink-4` | primary text → progressively muted |
| `--rule` / `--rule-2` | hairlines and borders |
| `--accent` / `--accent-soft` / `--accent-ink` | brand accent (terracotta `#C8553D` tenant default), its tint, and its darker readable companion |
| `--sage` / `--rose` / `--amber` (+ `-soft` tints) | success / danger / warning |
| `--swatch-1..8`, `--swatch-mix-base` | deterministic decorative product/category colors (same in dark) |
| `--scrim` | modal/drawer overlay dim (45% ink light / 60% black dark) |
| `--shadow-sm` / `--shadow` / `--shadow-lg` / `--shadow-focus` | elevation + focus ring |
| `--space-1..9`, `--radius-sm/-/-lg/-xl/-full` | spacing scale (4→96px), radii (6/10/14/24/pill) |
| `--serif` / `--sans` / `--mono` / `--font-arabic` | type stacks (see §3) |
| `--ease`, `--duration-1/2/3` | motion (120/200/320ms; global `prefers-reduced-motion` guard in tokens.css) |

Tailwind utilities map to these via the `@theme inline` block in `packages/ui/src/theme.css` (`bg-bg-elev`, `text-ink-3`, `rounded-lg`, `shadow-md`…). In hand-written CSS and inline styles, consume the raw names (`var(--rule)`), never the Tailwind-generated `--color-*`/`--spacing-*` aliases.

### Dark theme

`[data-theme="dark"]` on `<html>` overrides surfaces, inks, rules, the accent trio, the base semantic hues, the `-soft` tints, and `--scrim`. The tenant app resolves the stored preference (`madar_theme` in localStorage: light/dark/system) or `prefers-color-scheme` in a pre-paint inline script; Settings → Appearance switches it. The admin topbar has its own toggle (`madar_admin_theme`), defaulting to the system preference.

### Accent variants

`[data-accent]` on `<html>` selects terracotta (default) / ink / forest / cobalt, each with light + dark values.

### Theme switching for admin app

The admin app remaps the accent trio via a single HTML class:

```html
<html class="theme-admin">
```

No component code differs between apps. Components read `--accent`; the HTML class decides which physical color that points to.

---

## 3. Typography

### Fonts

```css
:root {
  --serif: var(--font-fraunces), "GT Sectra", "Source Serif 4", Georgia, serif;  /* display */
  --sans: var(--font-inter-tight), "Söhne", "Inter", -apple-system, sans-serif;  /* body */
  --mono: var(--font-jetbrains-mono), "IBM Plex Mono", ui-monospace, monospace;  /* codes, tabular data */
  --font-arabic: var(--font-plex-arabic), system-ui, sans-serif;                 /* lang="ar" body + headings */
}

html[lang="ar"] body { font-family: var(--font-arabic); }
html[lang="ar"] .serif { font-family: var(--font-arabic); }
```

Fonts are self-hosted via `next/font` in `packages/ui/src/fonts.ts` (`display: swap`; the Arabic family loads with `preload: false` so EN sessions never fetch it).

**Why these fonts:**
- **Fraunces** — variable serif, free on Google Fonts, exceptional in display sizes, supports a wide range of optical sizes.
- **Inter Tight** — free, highly legible at small sizes, modern. (An earlier draft specified Geist; Inter Tight is what the prototype and `packages/ui` actually ship.)
- **IBM Plex Sans Arabic** — IBM's open-source Arabic family; production-grade free Arabic typography. Arabic headings currently use the *sans* (no Arabic serif is shipped); adopting IBM Plex Serif Arabic for display is an open design decision.

### Type scale

| Token | Size (clamp) | Line-height | Use |
|---|---|---|---|
| `text-display` | clamp(48px, 6vw, 64px) | 1.05 | Hero numbers, marketing headlines |
| `text-h1` | clamp(32px, 4vw, 40px) | 1.15 | Page titles |
| `text-h2` | clamp(24px, 3vw, 28px) | 1.2 | Section titles |
| `text-h3` | 18–20px | 1.25 | Card titles, modal headers |
| `text-body` | 15–16px | 1.6 | Body text |
| `text-small` | 13–14px | 1.5 | Captions, secondary info |
| `text-tiny` | 11–12px | 1.4 | Microcopy, badges, labels |

### Letter-spacing

- Display sizes: `-0.01em` (slight tighten for visual cohesion)
- Body: `0` (default)
- Uppercase labels (table headers, eyebrows): `+0.04em`

### Weight usage

- **Inter Tight:** 400 (regular), 500 (medium for emphasis), 600 (semibold for buttons), 700 (bold rare, only for table totals)
- **Fraunces:** 400 (body of long-form), 500 (display body), 600 (display headlines)
- **Don't:** use 800/900 weights. They feel aggressive.

### Numerals

All number columns and currency values use **tabular numerals**:

```css
font-variant-numeric: tabular-nums;
```

POS totals additionally use the **display serif** at large sizes — currency feels like a price tag, not a spreadsheet cell.

---

## 4. Spacing

8-pixel base grid. Use these tokens, not arbitrary values:

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 24px;
--space-6: 32px;
--space-7: 48px;
--space-8: 64px;
--space-9: 96px;
```

### Padding rules

- **Card internal:** `--space-5` to `--space-6` (24–32px). Never `--space-3` (cramped).
- **Page gutters:** 32–48px desktop, 16–24px mobile.
- **Form field vertical:** 12–16px (between label and input, between inputs).
- **Page max-width:** 1280px centered.
- **Reading max-width:** 720px for prose-heavy screens (settings descriptions, policies).

### Tailwind helper

Tailwind's default scale aligns: `p-4` = 16px = `--space-4`. Prefer the Tailwind shorthand in components; the tokens exist for CSS-in-JS or arbitrary places.

---

## 5. Radius and Elevation

### Radius

```css
--radius-sm:   6px;   /* Inline: badges, small inputs */
--radius:   10px;  /* Buttons, small cards */
--radius-lg:   16px;  /* Cards, modals */
--radius-xl:   24px;  /* Hero panels, prominent containers */
--radius-full: 9999px;
```

### Shadow

Shadows are **soft, low, warm** — never harsh. Tinted with the ink color, not pure black.

```css
--shadow-sm:    0 1px 2px rgba(43, 43, 39, 0.04);
--shadow-md:    0 4px 12px rgba(43, 43, 39, 0.06);
--shadow-lg:    0 12px 32px rgba(43, 43, 39, 0.08);
--shadow-focus: 0 0 0 3px rgba(201, 100, 66, 0.18);
```

### Card default

```css
.card {
  background: var(--bg-elev);
  border: 1px solid var(--rule);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: var(--space-5);
}
```

The combination of border + shadow is intentional. Border alone reads cheap; shadow alone reads floating. Both together feel grounded.

---

## 6. Components

Components are **bespoke, token-driven CSS** — shadcn/ui is not used (see ADR 0006). The specs below describe the shared visual contract each app's implementation follows. The anti-pattern still stands: if a primitive ever *is* imported from a kit, restyle it to tokens before it ships.

### Button

```tsx
<Button variant="primary" size="md">Save</Button>
```

**Variants:**
- `primary` — filled `--accent`, white text, `--radius`, semibold.
- `secondary` — `--bg-elev`, 1px line border, ink text.
- `ghost` — no background, ink-muted text, accent on hover.
- `destructive` — `--rose` background, used only after explicit confirmation patterns.
- `link` — accent text, underline on hover, no background.

**Sizes:**
- `sm` — 32px tall, `--space-3` horizontal padding.
- `md` (default) — 40px tall, `--space-4` padding.
- `lg` — 48px tall, `--space-5` padding.
- `pos` — 64px tall, full-width default, used in POS sell screen.

**Rules:**
- No gradients.
- No glow effects.
- No fake 3D / bevel.
- Pressed state: scale to 0.97, 120ms.
- Disabled: 50% opacity, no pointer events.
- Loading: spinner replaces icon, label changes to gerund ("Saving…").

### Input

```tsx
<Input label="Product name" placeholder="e.g. Coca-Cola 330ml" />
```

**Structure:**
- Label above input, `text-small` weight 500, ink-muted color.
- Input: 1px border `--rule`, `--bg-elev` background, `--radius`, 12–16px padding, 40px default height.
- Focus: border darkens to `--ink-4`, `--shadow-focus` accent ring.
- Validation error: border becomes `--rose`, error message below in `text-small` danger color.
- Helper text below input in `text-small` ink-muted.

**Do not use floating placeholders for required fields.** Floating labels make scanning forms harder.

### Card

```tsx
<Card>
  <CardHeader>
    <CardTitle>Today's revenue</CardTitle>
    <CardDescription>Updated 2 minutes ago</CardDescription>
  </CardHeader>
  <CardContent>...</CardContent>
</Card>
```

- `--bg-elev` background, 1px line, `--radius-lg`, `--shadow-sm`.
- Internal padding `--space-5` to `--space-6`.
- Header uses **display serif** at `text-h3` for title.
- Description in body font, `text-small`, ink-muted.

### Table

- No vertical lines.
- Horizontal lines in `--rule`, only between rows (not above first row, not below last).
- Row hover: `--paper` background.
- Headers: `text-small`, uppercase, `+0.04em` tracking, ink-muted, weight 500.
- Cells: `text-body`, `--space-3` to `--space-4` padding.
- Numbers right-aligned in LTR, automatically flips in RTL via `text-end` class.
- Tabular numerals on number columns.
- Sortable headers: hover shows arrow indicator.
- Empty state: see Empty States section.

### Badge / Chip

```tsx
<Badge variant="success">Verified</Badge>
```

- `--radius-full`, `--space-1` vertical, `--space-3` horizontal padding.
- `text-tiny`, weight 500.
- Variants: `success` (`--sage`), `warning` (`--amber`), `danger` (`--rose`), `neutral` (`--ink-3`) — each uses the hue for text and its `-soft` tint for the background.

### Modal / Sheet

- Backdrop: `rgba(43, 43, 39, 0.3)` with 4px blur.
- Modal: `--bg-elev`, `--radius-xl`, `--shadow-lg`, max-width 600px (small), 900px (medium), 1200px (large).
- Sheet (slide-in from end): full-height, 480px wide on desktop, full-screen mobile.
- Header: 64px tall, padding `--space-5`, bottom border `--rule`. Title in display serif `text-h3`, close icon end-side.
- Content: padding `--space-5`.
- Footer (if action buttons): 72px tall, top border, padding `--space-5`, primary action end-aligned.

### Tabs

- Tab list: bottom border `--rule`, gap `--space-2` between tabs.
- Tab: `--space-3` horizontal, `--space-2` vertical padding, body weight 500, ink-muted.
- Active tab: ink color, 2px bottom border in `--accent`, slightly extending below the list border.

### Toast

- Position: bottom-end on desktop, bottom on mobile.
- Width: 360px max.
- `--bg-elev` background, 1px line, `--radius`, `--shadow-lg`.
- Padding: `--space-4`.
- Icon + title (weight 500) + body (ink-muted).
- Variants color the left border (4px) with semantic color.
- Auto-dismiss: 4s default, 0 (sticky) for errors.
- Slide-in 320ms with `--ease`.

### Skeleton (loading)

- `--bg-sunk` background, `--radius`.
- Subtle shimmer animation: linear gradient sweeping through, 1.5s, infinite.
- Match the shape of the eventual content: a card skeleton is card-shaped, a text skeleton is line-shaped.
- **No spinners** at page level. Skeletons only.

---

## 7. The POS Sell Screen — Special Component Rules

Highest-density screen in the product. Different rules apply:

- **No top nav, no sidebar.** A 48px slim header only: branch · cashier · time · End shift button.
- **Tap targets minimum 56px.** Cashier uses fingers on a tablet.
- **Product tiles:** square, `--radius`, image + name (2-line max) + price in display serif at `text-h3`. **No icons cluttering tiles.**
- **Cart panel:** fixed to inline-end (auto-flips in RTL), `--paper` background, full height.
- **Total amount:** display serif at **56–72px** with currency code. The hero of the screen. Tabular numerals.
- **Pay button:** full width of cart panel, **64px tall**, `--accent`, display serif text.
- **Number pad** (for manual amount entry): monospaced, large keys in grid with `--space-2` gaps.
- **Empty cart:** big muted illustration (shopping basket outline), one-line prompt.

---

## 8. Charts

Use Recharts, restyled.

- **Single accent color** for primary series — `--accent` (or `--accent (remapped by theme-admin)` in admin app).
- **Comparison series** desaturated to `--ink-3`.
- **No 3D**, no glossy fills.
- **Solid fills at 20% opacity** over the stroke for area charts.
- **Gridlines:** dashed, `--rule`, only on Y-axis (not X-axis).
- **Tooltips:** `--bg-elev`, 1px line, `--radius`, no arrow.
- **Axis labels:** `text-small`, ink-muted.
- **Legend:** below chart, body font, weight 500.

Avoid pie charts with more than 5 slices. Use horizontal bar instead.

---

## 9. Iconography

**Lucide React only.** No mixing with other icon sets.

- **Stroke width:** 1.5 (consistent across all icons).
- **No filled icons** mixed with stroked — pick one (we use stroked).
- **Size matches text:** 16px next to body, 20px next to h3, 24px next to h2.
- **Color inherits from text.** Don't color icons independently except in semantic chips.
- **Directional icons** (arrows, chevrons): apply `rtl:rotate-180` for RTL flipping.
- **No emoji as UI affordances.** ✅ ⚠️ 🔥 are not icons. Use real Lucide icons.

Icon-only buttons must have an `aria-label`.

---

## 10. Motion

Sparingly. The product feels fast because it **is** fast, not because everything wobbles.

```css
--ease:       cubic-bezier(0.2, 0.8, 0.2, 1);
--duration-1: 120ms;  /* Micro: button press, hover */
--duration-2: 200ms;  /* Standard: state transitions */
--duration-3: 320ms;  /* Larger: modals, panels */
```

### Approved motion

- **Modal/panel entrance:** fade + 8px translate from below or end-side, 320ms.
- **Button press:** scale to 0.97, 120ms.
- **Card hover:** shadow grows (sm → md) + 1px lift, 200ms.
- **Toast:** slide in from edge, 320ms; slide out same on dismiss.
- **Number count-up:** on dashboard hero numbers, 600ms ease-out, only on initial load and refresh.
- **Tab switch:** content fades through, 200ms.
- **Page transition:** subtle fade, 200ms — but skip on POS sell screen (would feel slow).

### Forbidden motion

- ❌ Bouncing or elastic easing.
- ❌ Parallax effects.
- ❌ Loading spinners that "breathe" or pulse decoratively.
- ❌ Confetti, sparkles, particles.
- ❌ Animated gradient backgrounds.
- ❌ Hover effects that delay the click — keep them under 100ms.

Respect `prefers-reduced-motion`. When set, replace transitions with instant changes.

---

## 11. Empty States

Every list, table, or data view has a designed empty state. Pattern:

1. **Quiet illustration or oversized Lucide icon** — `--ink-4`, 48–64px.
2. **Headline** — display serif `text-h3`, ink color. Explains *what's missing*.
3. **Body** — `text-body`, ink-muted, max 1 sentence. Explains *why this might be*.
4. **One CTA** — primary accent button. The most obvious next action.

Example for product list:
```
[Box icon, 64px, ink-subtle]
"No products yet"
"Add your first product to start selling."
[+ Add product]  ← primary button
```

If users genuinely cannot create the missing thing here (e.g., audit log), the CTA becomes a "Learn more" link instead.

---

## 12. Loading States

- **Page-level:** skeleton screens matching final layout. No spinners.
- **Inline:** small Lucide loader, 16px, accent color, smooth rotation.
- **Button:** keeps its size; content swaps to spinner + gerund label; button disabled.
- **Table:** show 5 skeleton rows with realistic column widths.
- **Image:** soft gray block in `--bg-sunk`, no spinner.

---

## 13. Error States

- **Field error:** inline below field, `--rose`, `text-small`, with small alert icon.
- **Form error:** banner at top of form, `--rose-soft` background, danger icon, message.
- **Section error:** card with alert icon centered, "Couldn't load [thing]", "Try again" button.
- **Full-page error:** centered card pattern like 404, with helpful actions.
- **Toast error:** appears bottom-end, danger left border, sticky (no auto-dismiss).

---

## 14. Bilingual / RTL Considerations

### Logical CSS properties

Use logical properties everywhere — these flip automatically based on direction:

```css
/* ❌ WRONG — physical */
margin-left: 16px;
text-align: left;
padding-right: 8px;

/* ✅ CORRECT — logical */
margin-inline-start: 16px;
text-align: start;
padding-inline-end: 8px;
```

In Tailwind:
```html
<!-- ❌ WRONG -->
<div class="ml-4 text-left pr-2">

<!-- ✅ CORRECT -->
<div class="ms-4 text-start pe-2">
```

### Directional icons

```tsx
<ChevronRight className="rtl:rotate-180" />
<ArrowLeft className="rtl:rotate-180" />
```

### Numbers and dates

- Always use `Intl.NumberFormat` and `Intl.DateTimeFormat` — never hand-format.
- Default to Western digits (1, 2, 3). Tenant setting can opt into Arabic-Indic digits (١، ٢، ٣) for display only — storage always uses Western.
- Dates default to Gregorian. Tenant setting toggles Hijri display.
- Currency symbol position handled by `Intl.NumberFormat({ style: 'currency' })`.

### Mirrored layouts

The entire POS sell screen mirrors in RTL: cart panel slides to the start side, product grid fills the end side. **All layouts must be tested in both directions before merge.**

---

## 15. Dark Mode

Implemented day one. Toggle in user settings; respects `prefers-color-scheme` by default.

- All tokens have dark variants.
- **No conditional logic in components.** Components read tokens; the `data-theme` attribute on `<html>` decides what those tokens evaluate to.
- Test every screen in both modes before marking done.
- Images and illustrations may need dark-mode variants — keep a `dark:` prefix or `data-theme="dark"` selector on background-dependent visuals.

---

## 16. Visual Differences Between Tenant and Admin Apps

| Property | Tenant app | Admin app |
|---|---|---|
| Primary accent | warm coral `#C96442` | slate teal `#4A6B7A` |
| Header badge | none | "Admin Panel" pill, slate teal |
| Sidebar label | "Workspace" | "Platform" |
| Impersonation banner | shown when impersonated | shown when impersonating |
| Languages | English + Arabic | English only (for now) |

The component code is **identical**. Only the HTML class on `<html>` (`theme-admin`) and the badge component change.

---

## 17. Anti-Patterns (Do Not Build)

- ❌ Glassmorphism / frosted blur effects (the 2021 SaaS look).
- ❌ Neon glows or saturated gradients on primary surfaces.
- ❌ Hover states with glowing borders.
- ❌ Stacked card shadows trying to look "3D".
- ❌ Dashboards with 12+ widgets above the fold.
- ❌ Emoji as UI affordances (✅ ⚠️ 🔥). Use real icons.
- ❌ Bouncing button animations.
- ❌ Background videos or auto-playing media.
- ❌ Cookie consent banners that take half the screen.
- ❌ Hero sections with stock photos of smiling people.
- ❌ Default shadcn styling (looks identical to every AI-built app).
- ❌ Animated gradient backgrounds.
- ❌ Loading spinners that say "loading…" — use skeletons.

---

## 18. Accessibility

- WCAG 2.1 AA compliance is the floor, not the ceiling.
- Color contrast: all text passes AA against its background. Use the in-repo contrast checker before adding new color combinations.
- Focus states: visible, accent ring, never `outline: none` without a replacement.
- Keyboard navigation: every interactive element reachable, logical tab order.
- Screen readers: semantic HTML first, ARIA only when needed.
- Touch targets: 44px minimum (56px on POS).
- Forms: every input has an associated `<label>`, errors are announced.
- Color is never the only signal: status uses icon + text + color.

---

## 19. Implementation Checklist

Before merging any UI component:

- [ ] Uses design tokens, not hardcoded values.
- [ ] Works in light and dark mode.
- [ ] Works in LTR and RTL (uses logical properties).
- [ ] Empty / loading / error states designed.
- [ ] Keyboard accessible.
- [ ] Color contrast passes AA.
- [ ] Touch targets meet minimum size.
- [ ] No `console.log`, no commented-out code.
- [ ] All text via `useTranslations()`.
- [ ] Visual regression tests pass.

---

## 20. Reference

- Token source: `packages/ui/tokens.css`
- Component source: `packages/ui/components/`
- Storybook (Phase 2): `pnpm storybook`
- Page-by-page application of the system: `PAGES.md`
- Build conventions: `CLAUDE.md`
