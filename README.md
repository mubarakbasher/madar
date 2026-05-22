# Madar

Multi-tenant SaaS Point of Sale — bilingual (English + Arabic), Claude-inspired design language, bank-transfer payments.

> **Read first:** [`CLAUDE.md`](./CLAUDE.md) for the build rulebook; [`docs/PRD.md`](./docs/PRD.md) for product scope; [`tasks.md`](./tasks.md) for the build roadmap.

---

## Current state

**Phase 1, first vertical slice** — the bilingual POS Sell Screen on top of mock data. No backend, no auth, no database yet (those are subsequent slices per `tasks.md`).

## Quick start

### Prerequisites

- Node 20+ (use `nvm install $(cat .nvmrc)` if you have nvm)
- pnpm 9+ — install once: `npm i -g pnpm`

### Run

```bash
pnpm install
pnpm dev:web
```

Then open:
- English (LTR): http://localhost:3000/en/pos
- Arabic (RTL): http://localhost:3000/ar/pos

## Scripts

```bash
pnpm dev:web         # start apps/web on :3000
pnpm typecheck       # typecheck the whole workspace
pnpm lint            # lint the whole workspace
pnpm i18n:check      # verify EN/AR translation parity in apps/web
```

## Repository layout

See `CLAUDE.md` → "Repository Structure". Short version:

```
apps/web/            # tenant-facing Next.js 14 app (bilingual)
packages/ui/         # design system: tokens, fonts, base components
docs/                # PRD, PAGES, architecture, design bundle, ADRs
.claude/             # project-level skills, subagents, hooks
tasks.md             # Phase 1 → 4 roadmap
CLAUDE.md            # rulebook for code agents
```

## How we work

- **Read the design first.** The prototypes at `docs/design/project/` are the visual source of truth. The skill `/madar-port-screen` walks through porting one.
- **Tokens only.** Every color, size, shadow comes from `packages/ui/tokens.css`. The `check-tokens` hook warns on hardcoded values.
- **Bilingual from day one.** Every user-facing string lives in both `apps/web/messages/en.json` and `apps/web/messages/ar.json`.
- **No payment gateway.** Bank transfer + receipt upload + manual verification.

---

## License

Proprietary. All rights reserved.
