# docs/ — Project Documentation

This folder contains all the supporting documentation referenced by `CLAUDE.md` (at the repo root). Claude Code reads these whenever it needs the deeper "how" or "why" behind a build decision.

## Files

| File | What it covers | Read when |
|---|---|---|
| **`PRD.md`** | Product scope, personas, modules, roadmap, success metrics | Building any new feature — confirm it fits the product vision |
| **`PAGES.md`** | UI specification for every page in both apps (61 tenant + 45 admin) | Building or modifying any page |
| **`design-system.md`** | Tokens, components, typography, motion, accessibility | Building any UI; setting up `packages/ui` |
| **`billing-flow.md`** | Bank transfer payment specs — both subscription and POS sale flows | Building anything that touches `payment_proofs` |
| **`admin-app.md`** | Super-admin app: routes, auth, impersonation, page list | Building `apps/admin/*` or admin-related backend |
| **`architecture.md`** | System architecture, module structure, RLS, jobs, deployment | Setting up infrastructure or thinking about scaling |
| **`i18n-guide.md`** | Translation workflow, RTL implementation, tooling | Adding any user-facing string or new UI component |
| **`i18n-glossary.md`** | Canonical EN→AR translations for domain terms | Translating; reviewing PRs that change Arabic text |
| **`api/openapi.yaml`** | API spec stub — endpoints filled in as built | Implementing controllers or client SDK |
| **`decisions/`** | Architecture Decision Records (ADRs) | Understanding *why* a non-obvious choice was made |

## Decision Records

The `decisions/` folder contains Architecture Decision Records (ADRs) — short notes about important choices and their reasoning. Adopted decisions are immutable; if a decision changes, add a new ADR that supersedes the old one.

| # | Decision | Status |
|---|---|---|
| 0001 | Modular monolith over microservices | Adopted |
| 0002 | Bank transfer with manual verification over payment gateway | Adopted |

Future ADRs are referenced in `architecture.md` section 16 (RLS, two frontends, English+Arabic equality, shadcn restyled, no AI in v1, offline POS, inventory commits on sale, two Prisma clients).

## How These Files Relate

```
CLAUDE.md                  ← Root build conventions for Claude Code
   │
   ├── docs/PRD.md         ← What we're building
   │
   ├── docs/PAGES.md       ← How every page looks and behaves
   │     ├── references design-system.md for tokens
   │     └── references admin-app.md for super-admin specifics
   │
   ├── docs/design-system.md  ← Tokens, components, motion
   │
   ├── docs/billing-flow.md   ← Payment specifics
   │     └── admin-app.md references this for verifier UI
   │
   ├── docs/admin-app.md   ← Super-admin app spec
   │
   ├── docs/architecture.md   ← System design
   │     └── decisions/* ADRs ground specific choices
   │
   ├── docs/i18n-guide.md  ← Translation workflow
   │     └── docs/i18n-glossary.md is the term dictionary
   │
   └── docs/api/openapi.yaml  ← REST API contract
```

## Order to Read for a New Contributor

If you're new to this project, read in this order:

1. **`CLAUDE.md`** (at root) — the build conventions and high-level setup
2. **`docs/PRD.md`** — what the product does
3. **`docs/architecture.md`** — how it's structured
4. **`docs/design-system.md`** — the visual language
5. **`docs/PAGES.md`** — every screen (skim, reference later)
6. The rest as needed for the specific area you're working on.

## Updating These Docs

These docs are the source of truth for design and architecture decisions. When a decision changes:

1. Update the relevant doc here.
2. If it's an architectural change, add a new ADR in `decisions/`.
3. Update `CLAUDE.md` references if necessary.
4. **Do not let code and docs drift.** Docs out of sync with code are worse than no docs.
