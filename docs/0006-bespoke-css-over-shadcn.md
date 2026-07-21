# 0006 — Bespoke token-driven CSS instead of shadcn/ui

**Status:** adopted (2026-07-22)

## Context

`CLAUDE.md` and `docs/design-system.md` §6 described the component layer as
"built on shadcn/ui with every primitive restyled". In reality no shadcn code
was ever added: there is no `components.json`, no Radix dependency, no `cva`.
Both apps ship bespoke components written directly against the design tokens
(`packages/ui/src/tokens.css`), styled with hand-written CSS classes
(`.btn`, `.card`, `.chip`, `admin-*`, feature-scoped files) and inline
token-consuming styles.

## Decision

Keep the bespoke token-driven approach and stop describing shadcn as the
base. It has delivered the design language faithfully (the 2026-07-22 design
review found zero default-kit styling and zero Tailwind palette leakage),
avoids a Radix/cva dependency surface, and the restyle-everything rule that
motivated shadcn is moot when every primitive is written from the tokens up.

## Consequences

- The "restyle default shadcn" anti-pattern in the docs becomes a guard for
  any future kit adoption rather than a description of the present.
- Interactive-primitive accessibility (focus trap, aria wiring in modals,
  menus) is owned by us, not Radix — reviews must check it explicitly.
- If a future need justifies adopting shadcn/Radix primitives (complex
  comboboxes, date pickers), that is a new ADR superseding this one.
