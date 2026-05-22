# 0001 — Modular Monolith over Microservices

**Status:** Adopted
**Date:** May 2026
**Deciders:** Product, Engineering

## Context

We are building a multi-tenant SaaS POS platform targeting SMBs. The product spans seven core domains (sales, inventory, branches, suppliers, reporting, billing, admin) plus a super-admin app. We need to decide on the high-level service architecture.

The team is small (2–4 engineers in v1). Time-to-market matters; we are not at Netflix scale.

## Decision

We will build the backend as a **modular monolith** in NestJS, organized by domain module. We will not split into microservices in v1.

The monolith will be designed for **eventual extractability** — modules expose service interfaces, not direct DB access, so a future ReportModule or BillingModule could be lifted out without rewriting.

## Consequences

### Positive

- **Faster shipping.** One deployable, one repo, one observability stack.
- **Transactions span modules.** A sale + inventory update + audit log entry is one DB transaction. No distributed-transaction complexity, no sagas.
- **Easier debugging.** One log stream, one trace.
- **Lower infrastructure cost.** One service to host, one DB connection pool.
- **Type safety end-to-end.** Shared types from `packages/shared` across all modules.

### Negative

- **Scaling is coarse-grained.** We scale the whole app, not just hotspots. Mitigated by the fact that our load profile is read-heavy with predictable hotspots (reports), addressable via read replicas, not service split.
- **Module boundaries can erode.** Without service-level enforcement, modules can accidentally couple. Mitigated by lint rules forbidding cross-module DB access and by code review discipline.
- **Build time grows linearly.** Eventually, full-monorepo CI could slow down. Mitigated by Turborepo's incremental caching.

### Neutral

- The architecture can evolve. We can extract a microservice when there's a concrete reason: a different team owns it, a different scaling profile demands it, or a regulatory boundary requires it.

## Alternatives Considered

### Microservices from day one

Rejected. The complexity tax (service mesh, distributed tracing, schema versioning, eventual consistency) is not justified at our scale and team size. Premature optimization.

### Serverless (Lambda / Cloud Functions)

Rejected. Cold-start latency is unacceptable for the POS sell screen (sub-200ms P95 target). Connection pooling to RDS is harder. Vendor lock-in is higher.

### Monolith with no modular boundaries

Rejected. Without module discipline, large codebases become unmaintainable. The modular structure is the insurance policy.

## References

- `architecture.md` section 2 — architectural style
- `CLAUDE.md` — module organization conventions
