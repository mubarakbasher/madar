# ADR 0005 — Offline sync validation: device identity, price drift, sequence gaps

**Status:** adopted 2026-06-12 · **Relates to:** audit finding M-14 (`docs/audit-2026-06-10.md`), CLAUDE.md "Offline POS" rules

## Context

CLAUDE.md requires offline sales to carry a client UUID + monotonic sequence
with server-side validation, and conflicts to land in `sync_conflicts`. The
enum kinds `price_drift` and (implicitly) sequence problems were unreachable:
nothing validated sequences, and a price change between offline capture and
sync caused a hard 422 (`split_total_mismatch`) that wedged the device queue.

## Decisions

1. **Device identity = persisted browser UUID.** The POS already mints
   `madar.device_uuid` in localStorage (`apps/web/src/lib/offline/device.ts`).
   It now travels on every sale as `sales.device_id` (nullable). No server
   registration — the id is an correlation subject, not a credential.
2. **Offline sales price at the till's snapshot — money reality wins.**
   `lines[].unit_price_cents` (the cached-catalog price the customer actually
   paid) is honored **only when `offline_completed=true`**; any difference
   from the live catalog is recorded as ONE `price_drift` conflict per sale
   (details: per-line client vs catalog prices) for manager review. Online
   sales always price from the live catalog and ignore the field.
3. **Per-device monotonic sequence validation.** For offline sales carrying
   `device_id` + `client_sequence`, the server compares against that device's
   highest stored sequence: anything other than `last + 1` records a
   `sequence_gap` conflict (`details.kind`: `gap` = sales possibly lost in
   the device queue; `out_of_order` = stale/replayed submission). The sale
   itself still completes — conflicts are review signals, not rejections
   (same philosophy as negative-stock).
4. **`product_unknown` is now surfaced.** An offline sale referencing a
   since-deleted product still 422s (it cannot be priced), but a
   `product_unknown` conflict row (keyed by `client_uuid`) makes the stuck
   queue entry visible to managers instead of failing silently client-side.

## Consequences

- Migration `20260612010000_offline_sync_validation`: `sales.device_id`,
  index on `(tenant_id, device_id, client_sequence DESC)`, enum value
  `sequence_gap`.
- Multi-tab tills share one device id and may interleave sequences — the
  existing single-tab assumption stands (device.ts comment); spurious
  out_of_order conflicts from multi-tab use are acceptable noise.
- Sequence state is per BROWSER PROFILE: clearing site data resets the
  counter to 1 and will flag one out_of_order conflict on the next offline
  sale. Acceptable — it genuinely is a discontinuity worth reviewing.
