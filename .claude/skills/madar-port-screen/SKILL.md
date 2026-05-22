---
name: madar-port-screen
description: Port a Madar design prototype (docs/design/project/*.jsx or *.html) to a real Next.js page in apps/web (tenant) or apps/admin (super-admin). Use when implementing any screen for which a prototype exists. Encodes the design-token, i18n, RTL, logical-CSS, and shadcn-restyle rules from CLAUDE.md so the port stays on-spec without re-reading the rulebook each time.
---

# madar-port-screen

You are porting a Madar design prototype into the real Next.js codebase. Match the visual output of the prototype, **don't copy its internal structure** — the prototype is HTML/JS scaffolding from Claude Design.

## Step 1 — locate the source

Design bundle lives at `docs/design/project/`. The mapping is in `tasks.md` under "Design bundle map" — read it once.

| Prototype | Target app |
|---|---|
| `screen-checkout.jsx`, `screen-dashboard.jsx`, `screen-inventory.jsx`, `screen-suppliers-branches.jsx`, `screen-analysis.jsx`, `screen-billing.jsx`, `screen-extras.jsx` | `apps/web` (tenant) |
| `admin-app.jsx`, `admin-screens.jsx`, `admin-verification.jsx` | `apps/admin` |
| `Madar Auth.html` | `apps/web` public/auth pages |
| `Madar Print.html` | `apps/web` print stylesheets |

If you can't find a prototype, **stop and tell the user**. Don't invent a design.

## Step 2 — pick the route

- Tenant: `apps/web/src/app/[locale]/<route>/page.tsx` (locale segment required)
- Admin: `apps/admin/src/app/<route>/page.tsx` (no locale segment)

## Step 3 — read these before writing

1. The prototype file end-to-end. Don't skim.
2. `docs/design/project/design-tokens.css` — the only valid set of color/type/spacing/radius/shadow values.
3. `CLAUDE.md` sections "Design System" and "Coding Conventions".
4. Existing pages in the target app for the file structure, layout, and import conventions (if any exist).

## Step 4 — port

**Tokens, no exceptions.** Every color, spacing, radius, shadow comes from the variables in `packages/ui/tokens.css` (which mirrors `docs/design/project/design-tokens.css`). If the prototype has `#C8553D`, you write `var(--accent)`. If it has `padding: 16px`, you write `padding: var(--space-4)` (or the Tailwind class that maps to it).

**Strings.** Tenant app: every user-facing string goes through `useTranslations()` and is added to both `apps/web/messages/en.json` and `apps/web/messages/ar.json`. The Arabic translation comes from `docs/design/project/i18n-ar.js` if the key exists there; otherwise mark it and ask the user, never machine-translate.

**Logical CSS only.** `ms-4` not `ml-4`. `pe-2` not `pr-2`. `text-start` not `text-left`. `inset-inline-start` not `left`. Even in admin app, prefer logical so the component is portable.

**Icons.** The prototype uses inline `<svg>` paths. Replace with `lucide-react` icons at the matching size, `strokeWidth={1.5}`. Match icon by intent (`Search`, `Bell`, `User`), not by SVG d-attribute.

**Components.** Use existing primitives from `packages/ui/` when available. If a primitive doesn't exist yet, build it in `packages/ui/` first — never re-implement in the page file.

**shadcn discipline.** If you import from `shadcn/ui`, restyle it through tokens. Default shadcn styling is **forbidden** by `CLAUDE.md`.

**State.** Cart, search, modals — same shape as the prototype, ported to React hooks. Keep state in the page or a colocated `use*` hook. Don't introduce Zustand stores for state that doesn't need to cross routes.

**Mock data.** If the backend doesn't exist yet, import the seed shape from `docs/design/project/data.js` into a local `mock-data.ts` next to the page. Mark it `// TODO: replace with API call when backend ships`.

## Step 5 — handle "Madar mode" rules

Some screens have global behaviors:
- **POS sell screen** sets `data-pos="true"` on the app shell to hide the standard topbar — implement via a layout segment or the app's data attribute.
- **Admin app** uses `--color-admin-accent` (slate teal) instead of `--accent`. Achieved with `<html class="theme-admin">` in `apps/admin/src/app/layout.tsx` — do not change accent in component code.
- **Impersonation banner** is rendered at the app shell level, not in any individual page. If your port references impersonation, ensure the shell handles it.

## Step 6 — checklist before declaring done

```
[ ] Page renders at the expected route in dev
[ ] Tested in EN (LTR) and AR (RTL) — every flipped property correct
[ ] Tested in light + dark
[ ] Zero hardcoded colors / px sizes / shadows
[ ] Zero hardcoded user-facing strings (tenant app)
[ ] Both en.json and ar.json updated; pnpm i18n:check passes
[ ] Icons are Lucide React, stroke 1.5
[ ] No default shadcn styling left
[ ] Empty / loading / error states for every list & form (CLAUDE.md requirement)
[ ] Screenshot captured (LTR + RTL + light + dark) for the PR
```

If you touched any data layer or auth, also run `/madar-rls-check` before commit.

## Step 7 — hand off

Output a short summary: files created, new translation keys added, any primitive added to `packages/ui/`, anything you couldn't translate (Arabic), any TODO left for the backend phase.

## What NOT to do

- Don't copy the prototype's CSS verbatim — tokenize.
- Don't copy the prototype's `<script type="text/babel">` structure — that's HTML/JS scaffolding, not React app structure.
- Don't generate Arabic translations yourself; pull from `i18n-ar.js` or ask.
- Don't add backend wiring "while you're there" — port the visual, leave a TODO. Backend follows the phase sequence in `tasks.md`.
- Don't bundle multiple screens in one PR. One screen, one PR, one set of screenshots.
