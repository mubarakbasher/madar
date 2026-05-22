# PRD.md — SaaS POS Platform

**Version:** 2.0
**Status:** Draft for Engineering Handoff
**Date:** May 2026

> **Companion documents:** `CLAUDE.md` (build conventions), `PAGES.md` (UI specs), `design-system.md` (visual reference), `billing-flow.md` (payment specifics), `admin-app.md` (super-admin spec), `architecture.md` (system design), `i18n-guide.md` (translation workflow).

---

## Table of Contents

1. Executive Summary
2. Goals and Non-Goals
3. Target Users and Personas
4. Functional Scope
5. Non-Functional Requirements
6. Technical Architecture (Summary)
7. User Experience Principles
8. Pricing and Plans
9. Roadmap
10. Success Metrics
11. Risks and Mitigations
12. Open Questions
13. Appendix

---

## 1. Executive Summary

A multi-tenant Software-as-a-Service Point of Sale (POS) platform for businesses that sell physical goods across one or more branches. Unifies sales transactions, inventory control, multi-branch operations, supplier relationships, and financial analysis into a single web application.

Targets small-to-medium businesses (SMBs) — retailers, wholesalers, restaurants, pharmacies, and service-product hybrids — that have outgrown spreadsheets and standalone cash registers but find enterprise ERPs overpriced and overcomplicated.

**Bilingual from day one:** English and Arabic, with full RTL layout, Arabic-Indic numerals option, and Hijri calendar awareness.

**Payments:** Bank transfer with receipt upload. No payment gateway integration. Works in markets where card processing is unreliable, expensive, or absent.

**Two applications, one backend:**
- **Tenant app** (`apps/web`) — used by business owners, managers, cashiers
- **Super-admin app** (`apps/admin`) — used by platform staff to operate the SaaS

### 1.1 Problem Statement

- **Fragmented tools.** SMBs juggle separate apps for sales, stock, accounting, and supplier orders.
- **Poor multi-branch visibility.** Owners cannot see in real time which branch is over- or under-stocked.
- **Reactive purchasing.** Stockouts and overstock both happen because reorder decisions rely on memory.
- **Opaque profitability.** Owners know revenue but not true profit per product, branch, or supplier.
- **Payment friction in some markets.** Card processing is expensive, unreliable, or unavailable.

### 1.2 Product Vision

A POS that runs the shop and the back office at once: a cashier rings up a sale on a tablet, the inventory at that branch decrements instantly, a low-stock alert triggers a draft purchase order to the right supplier, and the owner sees consolidated profit on her phone — all without leaving the platform.

### 1.3 Differentiators

- **Branch-native architecture** — multi-branch is a first-class concept, not an add-on.
- **Bank-transfer-friendly** — first-class support for receipt-upload payment flows, no gateway dependency.
- **Truly bilingual** — Arabic and English are equals, not afterthoughts.
- **Supplier scorecard** — automatically tracks fill rate, lead time, and price drift per supplier.
- **Offline-tolerant POS** — sales continue during internet outages and sync when reconnected.
- **Income analysis built-in** — gross profit, net margin, and contribution margin per SKU/branch/period without exporting to Excel.
- **Editorial design language** — warm, calm, paper-like. Inspired by Claude (Anthropic). Not another cold corporate dashboard.

---

## 2. Goals and Non-Goals

### 2.1 Business Goals

1. Achieve 500 paying tenants within 12 months of public launch.
2. Maintain monthly churn below 4 percent.
3. Reach NPS of 40 or higher among active tenants.
4. Average tenant onboarding time under 30 minutes from signup to first sale.

### 2.2 Product Goals

1. Process a sale in fewer than three taps for the most common scenario (cash, single item, no discount).
2. Surface real-time inventory across all branches with sub-second query latency at the 95th percentile.
3. Generate accurate income reports (gross revenue, COGS, gross profit, net margin) without manual data entry.
4. Support tenants with up to 50 branches, 50,000 SKUs, and 10,000 transactions per day per tenant on the standard plan.
5. Verify a bank-transfer payment proof in under 60 seconds of operator attention.

### 2.3 Non-Goals (v1)

- Payment gateway integration (Stripe, Paymob, etc.) — we use bank transfers.
- AI / LLM features — keep the system rule-based and predictable.
- Full accounting / general ledger — we export to Xero, QuickBooks.
- Payroll and HR management.
- Manufacturing / bill-of-materials production tracking.
- Customer-facing e-commerce storefront.
- Native mobile apps in v1 — responsive PWA only.

---

## 3. Target Users and Personas

| Persona | Role | Primary Goal | Key Pain Point |
|---------|------|--------------|----------------|
| Owner Olivia | Business Owner / Admin | See profitability across branches, set strategy | Cannot trust her own numbers |
| Manager Marcus | Branch / Store Manager | Hit branch targets, manage stock and staff | Drowning in stock-take spreadsheets |
| Cashier Carla | Front-line Operator | Ring up sales fast, handle returns | Slow software loses customers in queues |
| Supervisor Sami | Branch Supervisor | Verify bank-transfer payments, oversee shifts | Manual matching of bank screenshots to sales |
| Verifier Vera | Platform Finance Staff | Verify tenant subscription payments | Sifting through emailed receipts |
| Platform Owner | SaaS operator (you) | Run the business, monitor health | No single pane for tenant ops |

### 3.1 Persona Details

**Owner Olivia** — Owns 3–15 retail outlets. Mid-40s, not technical but financially literate. Uses laptop and phone equally. Wants a single dashboard answering: "How much did I make last month, and where is the leak?"

**Manager Marcus** — Runs one branch. Spends mornings counting stock, afternoons firefighting. Needs one-tap stock transfers, fast cycle counts, clear branch performance metrics.

**Cashier Carla** — Hourly worker. Trained in 30 minutes or less. Needs an interface so simple it cannot be misused. Speed and forgiveness are everything.

**Supervisor Sami** — Verifies bank-transfer payments from customers. Spends 10–20 minutes per day on this queue. Needs fast image preview, clear approve/reject, audit trail.

**Verifier Vera** — Your finance team member. Verifies tenant subscription payments. Spends 1–2 hours per day on this. Needs keyboard-driven queue, fast image viewer, fuzzy matching against bank statements.

**Platform Owner** — You. Needs MRR dashboard, tenant health, churn signals, ability to impersonate for support.

---

## 4. Functional Scope

Seven core modules plus the super-admin platform app.

### 4.1 Sales and POS Module

**Purpose:** capture every sale quickly, accurately, and offline-tolerantly.

**Core features:**
- Cart with barcode scan, manual SKU lookup, visual product grid.
- Multi-tender payments: cash, bank transfer (with receipt capture), manual card (external terminal), store credit, split tender.
- Discounts at line or cart level, permission-gated.
- Tax engine: inclusive, exclusive, zero-rated, multi-jurisdiction.
- Hold / park sale.
- Returns and refunds tied to original receipt.
- Customer attach (optional).
- Receipts: thermal print (58/80mm), email, SMS, QR download. Bilingual or single-language per branch setting.
- Offline mode: transactions cached locally, replayed on reconnect.

**Acceptance criteria:**
- Single-item cash sale in three taps or fewer.
- Sale latency under 200ms P95 on 4G tablet.
- Offline mode tolerates 8+ hours of typical volume.
- Every sale, void, return logged immutably.

### 4.2 Inventory Module

**Purpose:** know exactly what is in stock, where, and what to do about it.

**Core features:**
- Product catalog with translatable (en/ar) names, categories, brands, units, cost, price, tax class, images, variants.
- Per-branch stock levels: quantity on hand, reserved, available.
- Stock movements ledger: sales, purchases, transfers, adjustments, returns, write-offs, recounts. Immutable.
- Stock transfers between branches with in-transit state and discrepancy flagging.
- Cycle counts and full stock-takes with mobile barcode scan UI.
- Reorder logic: per-branch reorder point and reorder quantity, manually set. Optional daily SQL job suggests reorder points using rolling 30-day average × lead time.
- Low-stock and out-of-stock alerts.
- Expiry and batch tracking (toggleable per category).
- Serial number tracking (toggleable per product).

**Acceptance criteria:**
- Stock consistency within 1 second of a transaction.
- 1,000-SKU stock-take in 60 minutes with two-person team.

### 4.3 Branch Management Module

**Purpose:** treat each location as a first-class entity.

**Core features:**
- Branch CRUD: address, timezone, currency (multi-currency supported), tax jurisdiction, contact.
- Per-branch staff assignment with role-based permissions.
- Per-branch pricing override (optional).
- Per-branch operating hours and holiday calendar.
- Branch performance dashboard.
- Inter-branch leaderboard (toggleable).
- Cash drawer / register / shift management with float and reconciliation.

### 4.4 Supplier Management Module

**Purpose:** turn suppliers from a contact list into a measurable performance system.

**Core features:**
- Supplier CRUD: contacts, payment terms, lead time, currency, tax ID.
- Catalog mapping: products per supplier with cost and effective dates.
- Purchase orders: draft, send (PDF + email), confirm, partial-receive, close.
- Three-way match: PO, goods received, invoice.
- Goods receipt with barcode scan; auto-updates inventory.
- Supplier returns (RMA) with reason codes.
- Supplier scorecard: fill rate, on-time delivery, average lead time, price-change frequency, defect rate.
- Document attachments.

### 4.5 Income Analysis Module

**Purpose:** answer profitability questions without exporting data.

**Core reports:**
- Sales summary: revenue, units, transactions, average basket — by period and branch.
- Profit & loss: revenue − COGS, by period, branch, category, SKU.
- Top movers: best/worst by revenue, units, and profit (three different rankings).
- Margin analysis: by category, branch, supplier; flag declining margins.
- Trend analysis: rolling 7/30/90-day, year-over-year.
- Tax report: taxable sales, tax collected, by jurisdiction.
- Cash flow snapshot: sales received − supplier payments − refunds.
- Custom dashboards: drag-and-drop widgets.

**Export and integration:**
- CSV, XLSX, PDF exports.
- Scheduled email delivery.
- Webhooks + REST API (Phase 4).
- Connectors: QuickBooks Online, Xero, Google Sheets (Phase 4).

### 4.6 Users, Roles, and Permissions

| Role | Sales | Inventory | Branches | Suppliers | Reports | Settings |
|------|-------|-----------|----------|-----------|---------|----------|
| Owner / Admin | Full | Full | Full | Full | Full | Full |
| Branch Manager | Full (own) | Full (own) | View own | View | Branch reports | Limited |
| Cashier | Sell, basic returns | View, recount | None | None | Own shift | None |
| Accountant (read-only) | View | View | View | View | Full | None |
| Auditor | View + audit log | View + audit log | View | View | Full | None |

Permissions are configurable per tenant; the table is the default template.

### 4.7 Notifications and Audit Log

- Configurable alerts: low stock, large discount, refund threshold exceeded, end-of-day variance, sync failure, payment verified/rejected.
- Channels: in-app, email, optional WhatsApp/SMS via Twilio.
- Immutable audit log of all create/update/delete actions. Auditor role reads; nobody modifies.

### 4.8 Payments and Billing — Bank Transfer Model

**Purpose:** handle both tenant subscription payments and customer in-store payments through one consistent receipt-upload-and-verify pattern. No payment gateway.

**Subscription billing flow:**
1. Tenant signs up → 14-day free trial. No payment info required.
2. Trial ending → invoice generated with platform's bank accounts and reference code.
3. Tenant transfers, uploads receipt, enters payer name and bank reference.
4. Super-admin (Finance/Verifier role) verifies in the admin app queue.
5. Approve → subscription extends. Reject → tenant resubmits.
6. Suspension states: active → grace_period → suspended → cancelled.

**POS bank-transfer flow:**
1. Cashier selects Bank Transfer at checkout.
2. POS shows QR code with tenant's receiving account + amount.
3. Customer transfers, shows confirmation.
4. Cashier uploads receipt photo and bank reference.
5. Sale marked `payment_pending`. **Inventory commits regardless** — goods left the shop.
6. Supervisor verifies from tenant verification queue.
7. Approve → `paid`. Reject → `disputed`.

**Other POS payment methods:** cash, manual card (external terminal), store credit, split tender.

**Critical rule:** verification is always a human action. No auto-approval.

### 4.9 Super-Admin Platform App

See `admin-app.md` for full specification. Summary:

- Separate Next.js app at `admin.yourpos.com`.
- Separate auth realm, MFA mandatory.
- Cross-tenant access via `adminPrisma` (bypasses RLS explicitly).
- 45 pages across 4 phases (10 MVP, then expanding).
- All actions audited to `platform_audit_log` (separate from tenant `audit_log`).
- Login-as impersonation with double-logging and visible banner.

---

## 5. Non-Functional Requirements

### 5.1 Performance
- POS sale completion: P95 under 200ms, P99 under 500ms.
- Dashboard load: under 2 seconds with 90 days of data.
- Report generation (1M rows): under 10 seconds.

### 5.2 Availability
- 99.9% monthly uptime SLA on paid plans.
- Offline POS tolerates 24-hour outages.
- Hourly database backups, 30-day point-in-time recovery.

### 5.3 Security
- Multi-tenant isolation via PostgreSQL Row-Level Security.
- TLS 1.3 in transit, AES-256 at rest.
- No card data stored (no PCI scope).
- MFA required for Owner role; mandatory for all super-admins.
- SSO (Google, Microsoft) on higher tiers.
- Role-based access control with audit log.
- Secrets in managed vault.
- Uploaded files virus-scanned (ClamAV) and EXIF-stripped.

### 5.4 Compliance
- GDPR, CCPA: data subject access, export, deletion.
- Configurable data residency (US, EU, MENA).
- Tax compliance hooks for region-specific e-invoicing — phase 2.
- Payment proof retention: 7 years (audit/tax).

### 5.5 Scalability
- Horizontal scaling for stateless services.
- Read replicas for reporting.
- Async job queue (BullMQ) for heavy operations.

### 5.6 Accessibility and Localization
- WCAG 2.1 AA compliance.
- Full RTL layout for Arabic.
- Initial languages: English, Arabic.
- Currency, date, number formats follow tenant locale.
- Optional Arabic-Indic numerals and Hijri calendar.

---

## 6. Technical Architecture (Summary)

See `architecture.md` for full diagrams.

- **Modular monolith** on the API tier (NestJS), evolving toward selective service extraction.
- **PostgreSQL 16** as primary database with RLS for tenant isolation.
- **Two Prisma clients:** `tenantScoped` (RLS-enforced) and `adminPrisma` (RLS-bypassed, super-admin only).
- **Two Next.js apps** sharing the API and the design system package.
- **Redis + BullMQ** for cache and background jobs.
- **S3-compatible storage** for receipts and images, signed URLs only.
- **ClamAV** for file scanning.
- **MinIO** locally, AWS S3 in production.

---

## 7. User Experience Principles

- **Calm over busy.** White space is a feature.
- **Warm, not cold.** Off-white backgrounds and earthy accents.
- **Editorial typography.** Magazine-like hierarchy.
- **Speed beats beauty at the POS.** Tenth-of-a-second optimization.
- **Progressive disclosure on the back office.** Show the headline; let users drill.
- **One interface across devices.** PWA, responsive, same code path.
- **Forgiving by default.** Undo where possible, manager override for destructive.
- **Empty states teach.** Every empty list explains the next action.
- **Bilingual equality.** Arabic UX is not a translation, it's a first-class layout.

See `design-system.md` for visual specifics.

---

## 8. Pricing and Plans (Indicative)

Per-branch per-month, with a per-tenant base. Final pricing TBD.

| Plan | Branches | Users | Transactions/mo | Indicative Price |
|------|----------|-------|------------------|------------------|
| Starter | 1 | 3 | 1,500 | $29 / branch |
| Growth | Up to 5 | 15 | 10,000 | $59 / branch |
| Business | Up to 25 | Unlimited | 100,000 | $99 / branch |
| Enterprise | Unlimited | Unlimited | Custom | Custom |

14-day free trial on all plans. No card required to start. Payment via bank transfer with receipt upload.

---

## 9. Roadmap

### Phase 1 — MVP (Months 1–3)
- Monorepo scaffolding, i18n + RTL, design system.
- Auth (tenant + admin), multi-tenancy data layer.
- Product catalog, single-branch inventory.
- POS core (online), bank transfer flow, payment-proof module.
- Basic reports.
- Subscription billing via bank transfer.
- Super-admin MVP (10 pages).

### Phase 2 — Multi-Branch (Months 4–6)
- Branches, transfers, roles & permissions UI.
- Suppliers and purchase orders.
- Offline POS.
- Owner dashboard, leaderboard.
- Super-admin Phase 2 (tickets, templates, reconciliation, feature flags, health).

### Phase 3 — Reporting (Months 7–9)
- Profit & loss, margin, trend, tax reports.
- Custom dashboards.
- Scheduled email delivery.
- Super-admin Phase 3 (MRR, cohort, churn, announcements).

### Phase 4 — Ecosystem (Months 10–12)
- Public REST API + webhooks.
- QuickBooks / Xero connectors.
- Loyalty & customer segmentation.
- Native mobile apps.
- Super-admin Phase 4 (plans editor, webhooks log, compliance).

---

## 10. Success Metrics

### 10.1 Product
- **Activation:** 80% of new tenants complete first sale within 7 days.
- **Engagement:** DAU/MAU above 60%.
- **Adoption:** average tenant uses 4 of 7 modules within 30 days.
- **Reliability:** P95 sale latency under 200ms; uptime 99.9%.

### 10.2 Business
- Net new tenants per month.
- Monthly logo and revenue churn under 4%.
- Branches per tenant grows over time.
- CAC payback under 12 months.

### 10.3 Customer
- NPS above 40.
- CSAT on support tickets above 90%.
- Time-to-first-value under 30 minutes.

### 10.4 Operational (Super-Admin)
- Median payment verification time under 60 seconds.
- Payment proof rejection rate under 10%.
- Aging report: no proofs pending > 48 hours.

---

## 11. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Verification queue becomes ops bottleneck | High | High | Hire ahead, build bank statement reconciliation early, keyboard-driven verifier UI |
| Multi-tenant data leakage | Low | Critical | RLS, automated tests on every query, third-party security audit pre-launch |
| Offline-online sync conflicts | Medium | High | Server-authoritative model; flag conflicts; extensive testing |
| Performance degradation at scale | Medium | High | Load testing in CI, read replicas, query budgets, observability from day 1 |
| Competitor undercuts pricing | High | Medium | Compete on bilingual UX, branch features, and design — not price |
| Local tax compliance complexity | High | Medium | Flexible tax engine; tax-service hooks per region |
| Arabic typography rendering on thermal printers | Medium | Medium | Test early on 58mm and 80mm hardware; have fallback fonts |
| Receipt fraud (fake bank screenshots) | Medium | Medium | Match against bank statement imports; flag duplicate references; audit trail |

---

## 12. Open Questions

1. Which initial geographic markets do we launch in?
2. Hardware policy — sell/rent receipt printers and scanners, or only certify?
3. Free tier — yes or no, what limits prevent abuse?
4. How do we handle disputed transactions when offline sync conflicts?
5. Data export commitment on cancellation? (Recommend: full export in machine-readable format for 90 days post-cancellation.)
6. Should super-admin app eventually be bilingual (Arabic for ops team)?
7. WhatsApp notifications via Twilio — launch with or defer?

---

## 13. Appendix

### 13.1 Glossary

- **SKU** — Stock Keeping Unit; unique identifier for a product variant.
- **COGS** — Cost of Goods Sold.
- **PO** — Purchase Order.
- **RMA** — Return Merchandise Authorization.
- **RBAC** — Role-Based Access Control.
- **RLS** — Row-Level Security; database-level isolation.
- **PWA** — Progressive Web App.
- **P95 / P99** — 95th / 99th percentile latency.
- **MRR / ARR** — Monthly / Annual Recurring Revenue.
- **MFA** — Multi-Factor Authentication.
- **Tenant** — A business (customer) using the SaaS; has its own isolated data.
- **Super-admin** — Platform staff (us) operating the SaaS.

### 13.2 Document Control

| Version | Date | Author | Change |
|---------|------|--------|--------|
| 0.1 | May 2026 | Product | Initial draft |
| 1.0 | May 2026 | Product | Approved for engineering |
| 2.0 | May 2026 | Product | Removed AI features; added Arabic, bank-transfer billing, super-admin app, Claude-inspired design |
