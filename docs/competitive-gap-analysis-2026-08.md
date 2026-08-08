# Competitive Gap Analysis — Madar vs. best-in-class POS & ERP (August 2026)

## 1. Purpose & method

This document answers one question for the product owner: **what is Madar missing compared to the best POS and ERP products it competes with — and which of those misses actually matter?**

- **Research date:** 2026-08-08. Competitor facts were gathered by live web research of official product pages, pricing pages, documentation, and 2025–2026 release notes; per-competitor sources are in Appendix B. Marketing pages are not contracts — treat 🟡 ratings especially as "verify in a demo before betting on it."
- **Madar facts** come from this repo (`tasks.md`, `docs/PRD.md`, `docs/PAGES.md`, ADRs, `packages/db/prisma/schema.prisma`); per-cell evidence is in Appendix A.
- **Refresh guidance:** re-run this analysis yearly, or immediately before entering a new market (the compliance section moves fastest). Square restructured its entire pricing in Oct 2025, Zoho launched a Saudi POS in Dec 2025, and Rewaa raised a $45M Series B in Dec 2025 — this landscape does not sit still.
- **Language note:** internal docs are English-only; the repo's i18n rules apply to user-facing strings, not documentation.

Two comparison tiers, per the product owner's decision:

- **POS tier** — products Madar meets in a deal today: Rewaa, Foodics, Loyverse, Square, Lightspeed Retail.
- **ERP tier** — the "upgrade path" products a growing tenant might leave for: Odoo, ERPNext, Zoho (Books + Inventory + POS), SAP Business One.

**Excluded deliberately:** Toast (US-only; Foodics covers the restaurant persona in-market), NetSuite and Dynamics 365 Business Central (enterprise buyer — their presence would not change any decision below), Salla/Zid (e-commerce platforms, not POS — they appear here only as integration targets).

### Rating legend

Competitor columns: ✅ native & generally available · 🟡 partial, higher-tier plan, or paid/marketplace add-on · ❌ not offered · `?` could not be verified from official sources (never guessed).

**Madar column** (drives gap classification mechanically):

| Symbol | Meaning |
|---|---|
| ✅ | Built and shipped (Phases 1–3.6) |
| 🔶 | Planned in PRD/PAGES/tasks.md but **not built** — no schema, no code |
| ❌ | Missing — not planned anywhere |
| 🚫 | **Non-goal by design** — deliberate, ADR/PRD-cited; reported, never recommended |

## 2. Competitor landscape

### POS tier

| Product | Entry price | Target buyer | MENA fit |
|---|---|---|---|
| **Rewaa** (SA) | SAR 275/mo (annual, excl. VAT), 14-day trial | Saudi SMB retail, F&B, services — **no pharmacy vertical, no wholesale** | Arabic-first; native ZATCA Phase 2; SAR-only, Saudi-only; SoftPOS (Rewaa Pay); $45M Series B Dec 2025 |
| **Foodics** (SA) | ~SAR 423/mo Starter (quote-finalized) | MENA F&B only — QSR to multi-brand chains | AR/EN across POS+KDS; ZATCA Phase 2 B2C native (B2B via add-on); KSA/UAE/EG/JO/KW/QA |
| **Loyverse** (global) | **Free core** (POS + Dashboard + KDS + Customer Display); add-ons $5–25/mo | Micro/small retail, café, salon — the "floor" Madar's smallest prospects compare against | Arabic POS app; no ZATCA/ETA anywhere official; no Salla/Zid; USD pricing |
| **Square** (US) | Free / $49 / $149 per location/mo + processing | SMB retail + restaurants in 8 countries | **Not available in MENA**; no Arabic. Depth baseline only |
| **Lightspeed Retail** (X-Series) | $89 / $149 / $289 per location/mo | Independent-to-mid-market specialty retail (NA/UK/ANZ/EU) | No MENA presence, no Arabic; ZATCA only via third-party add-on. Retail/wholesale ceiling reference |

### ERP tier

| Product | Entry price | Target buyer | MENA fit |
|---|---|---|---|
| **Odoo** (open-core suite) | One App Free $0 · Standard $7.25–8.95/user/mo · Custom $10.90–13.60 (**external API is Custom-only**) | Horizontal SMB→mid-market; POS is one of 40+ apps; the most common "outgrew my POS" destination | Native fiscal localizations: **KSA ZATCA Phase 2** (`l10n_sa_edi`), **Egypt ETA** (`l10n_eg_edi_eta`), UAE VAT + bilingual EN/AR invoices; Arabic UI widely deployed (official doc page unverified during research) |
| **ERPNext** (open source, v16 Jan 2026) | Frappe Cloud from $5/mo; self-host free (GPLv3); partner-led | Owner/CFO buyers via implementation partners; deep inventory/B2B core | Arabic translation exists but **RTL mirroring incomplete** (open requests, 2026); ZATCA/ETA only via third-party apps (ERPGulf etc.); UAE VAT native; real Gulf partner network |
| **Zoho** (Books + Inventory + POS) | Books SA from SAR 69/mo · Inventory $29+/mo · **Zoho POS SA from SAR 39/mo** · Zoho One $37–105/user/mo | SMB back-office suite; **Zoho POS (ex-Zakya) launched a Saudi edition Dec 2025** — a brand-new direct entrant in Madar's niche | Full Arabic RTL UI (POS SA), 4 bilingual invoice layouts, **ZATCA-approved Phase 2** (Books, KSA data center), UAE FTA-certified; Egypt weak; no restaurant/pharmacy verticals |
| **SAP Business One** | Quote-only via partners (third-party estimates ~$95–250/user/mo cloud — unofficial) | Mid-market wholesalers/distributors — the MENA B2B ceiling | Arabic UI + per-customer document language; official Central-MENA localization (VAT reports, updated May 2026); **ZATCA/ETA only via partner add-ons**; POS via SAP Customer Checkout add-on |

## 3. Madar positioning — and what it deliberately does not do

Madar is a multi-tenant SaaS POS for SMB **retailers, wholesalers, restaurants, and pharmacies** in EN/AR markets: bilingual/RTL day-one, per-branch inventory on an immutable stock-movements ledger, offline-capable POS, supplier purchasing, income analysis, and a bank-transfer-plus-human-verification payment model on both the subscription side and the in-store side. Phases 1–3.6 are shipped (40 Prisma models, RLS on every tenant table, ~2 615 i18n keys in EN/AR lockstep); Phase 4 (loyalty, public API, connectors, native apps) is not started.

**Where Madar already beats this field** (worth stating before the gaps): the deepest true-bilingual EN+AR implementation in the comparison (Rewaa is Arabic-first with English gaps — its quotations are Arabic-only; ERPNext's RTL is incomplete; Lightspeed/Square have no Arabic at all); DB-level append-only audit logs (stronger than Square's partial Activity Log or Lightspeed's "not every change is audited"); an offline POS with idempotent replay and conflict surfacing (ERPNext has no working native offline mode); true multi-currency with per-branch currency and snapshot FX (Rewaa is SAR-only, Square/Loyverse one currency per account); and the zero-processing-fee bank-transfer model with human verification — no competitor has an equivalent, because they all monetize payments.

### Missing by design — read this before the gap register

These are **decisions, not oversights**. Each has a citation and the one-line answer to give a prospect who asks.

| Non-goal | Where decided | What we tell a prospect |
|---|---|---|
| Payment gateway / integrated card acquiring (incl. softPOS) | ADR 0002; `CLAUDE.md` (named forbidden: Stripe, Paymob, Tap, PayTabs) | "Madar never touches your money — payments go directly to *your* bank account with zero processing fees; the POS documents and verifies them." |
| Auto-charge / card-on-file subscription billing | ADR 0002, `docs/billing-flow.md` | "You pay by bank transfer when the invoice comes. No card details, ever, anywhere." |
| Full accounting general ledger | PRD §2.3 | "Madar gives you sales-side P&L and tax reports; your accountant keeps the ledger in the tool they already use — we export to it." (connectors: Phase 4) |
| Payroll / HR | PRD §2.3 | "We do roles and shift reconciliation, not salaries — payroll tools do that better." |
| Manufacturing / bill-of-materials | PRD §2.3 | "Madar tracks what you buy and sell, not what you fabricate." (Restaurant *recipe depletion* is adjacent but distinct — see G-07.) |
| E-commerce storefront (v1) | PRD §2.3 | "Sell in-store today; storefront connectors are on the roadmap, not a bolted-on webshop." |
| AI/LLM features | ADR 0007 | "Every number in Madar is deterministic and explainable — no black-box suggestions." |
| Native mobile apps (v1) | PRD §2.3 | "The PWA installs from the browser and works offline — no app store required." |

Note on scope: the GL non-goal excludes *general accounting*. Customer accounts-receivable arising from **credit sales** (a wholesaler's daily workflow) is a POS-domain feature, not a ledger feature — see G-04. The BOM non-goal excludes *production orders*; **recipe depletion** (a sale decrementing ingredient stock via the existing `stock_movements` ledger) is a sale-time inventory rule — see G-07.

## 4. Regulatory reality check (researched 2026-08-08)

The Phase 3.6 deferral of e-invoicing ("not legally required under threshold") **no longer holds for Saudi Arabia and is doubtful for Egypt**:

- **Saudi Arabia (ZATCA Phase 2):** Wave 24 (revenue > SAR 375 000) has been **enforced since 30 June 2026**. Wave 25 — announced 24 July 2026 — drops the floor to **SAR 187 500 (the voluntary VAT-registration line) by 1 February 2027** (ZATCA-sourced; KPMG 2026-07-28). A POS sold to any VAT-registered Saudi SMB must produce ZATCA-compliant simplified invoices (QR, UUID, cryptographic stamp, hash chain, reporting within 24h) and, for B2B, real-time clearance. Penalties reach SAR 50 000–100 000. **E-invoicing is market-blocking in KSA today.**
- **Egypt (ETA):** B2B e-invoicing has been universal for VAT-registered businesses since 2023; the B2C **e-receipt** mandate has been expanding in waves since January 2025 (vendor-sourced bands put EGP 1–10M businesses in scope during Q3–Q4 2026). POS requirements: near-real-time transmission, QR per receipt, digital signature via approved CA, sequential numbering, GS1/EGS product coding. The old "~EGP 5M/yr threshold" rationale in `tasks.md` does not match the current wave structure. **Market-blocking for VAT-registered Egyptian tenants today** (exact out-of-scope band unconfirmed against primary sources).
- **UAE:** Peppol-based (PINT AE) rollout; July 2026 Phase 1 is reporting/pilot; mandatory dates (Jan 2027 for ≥AED 50M, Jul 2027 for the rest — vendor-sourced, unconfirmed) cover **B2B/B2G only; B2C is explicitly excluded** for now. **Not blocking for the core POS sale; matters for the wholesale/B2B invoicing path.**
- **Data protection:** Saudi **PDPL fully enforced since Sep 2024** — "transfer" includes hosting abroad *and remote access by foreign staff*; fines to SAR 5M; no SME carve-out. Egypt **PDPL grace period ends 31 Oct 2026** with a licensing regime plus per-country transfer permits. Not sale-blocking, but **architecture-blocking**: Madar's data-residency configuration, GDPR-style export/delete tooling (admin pages A29/A30 — specced, unbuilt), and support-access model must exist before onboarding KSA/Egypt tenants at scale.

## 5. Comparison matrix

Columns: **M** = Madar · Rw = Rewaa · Fd = Foodics · Lv = Loyverse · Sq = Square · LS = Lightspeed · Od = Odoo · EN = ERPNext · Zh = Zoho · B1 = SAP Business One. Madar-cell evidence: Appendix A. Competitor evidence: research bundle sources, Appendix B.

### A. POS & checkout

| # | Capability | M | Rw | Fd | Lv | Sq | LS | Od | EN | Zh | B1 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A1 | Tenders incl. split & store credit | ✅ | 🟡 | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | ✅ | 🟡 | 🟡 |
| A2 | Gift cards | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | 🟡 | ✅ | 🟡 |
| A3 | Hold / park sales | ✅ | ✅ | ? | ✅ | ✅ | ✅ | ? | 🟡 | ✅ | ? |
| A4 | Returns tied to original receipt | ✅ | ✅ | ✅ | 🟡 | ✅ | ✅ | ? | ✅ | 🟡 | 🟡 |
| A5 | Discounts + manager override | ✅ | 🟡 | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | 🟡 | 🟡 | 🟡 |
| A6 | Receipt delivery (print/email/SMS/WhatsApp) | ✅ | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | ✅ | 🟡 |
| A7 | Barcode scanner & weighing scale | 🟡 | ✅ | 🟡 | ✅ | ✅ | 🟡 | ✅ | 🟡 | ✅ | 🟡 |
| A8 | Shifts / drawer / Z-report | ✅ | 🟡 | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | ✅ | 🟡 | 🟡 |
| A9 | Offline mode | ✅ | ✅ | ? | ✅ | ✅ | ✅ | ✅ | 🟡 | ✅ | 🟡 |
| A10 | Customer-facing display | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 | ✅ | ? |

### B. Inventory

| # | Capability | M | Rw | Fd | Lv | Sq | LS | Od | EN | Zh | B1 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| B1 | Variants / matrix | 🔶 | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ? |
| B2 | Multi-UoM conversions (case/each) | ❌ | 🟡 | ✅ | ? | 🟡 | 🟡 | ✅ | ✅ | ✅ | ✅ |
| B3 | Bundles / composites | ❌ | ✅ | ✅ | ✅ | 🟡 | ✅ | ✅ | ✅ | ✅ | 🟡 |
| B4 | Batch / lot + expiry | 🔶 | ✅ | ❌ | ❌ | ❌ | 🟡 | ✅ | ✅ | ✅ | ✅ |
| B5 | Serial numbers | 🔶 | ✅ | ❌ | ? | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| B6 | Stock counts / cycle counts | 🔶 | ✅ | ✅ | 🟡 | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 |
| B7 | Inter-branch transfers | ✅ | ✅ | ✅ | 🟡 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| B8 | Reorder / forecasting | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ✅ | ✅ | ✅ | 🟡 | ✅ |
| B9 | Barcode label printing | ❌ | ✅ | ? | 🟡 | 🟡 | ✅ | ? | 🟡 | ✅ | 🟡 |
| B10 | Multi-location stock pivot | 🔶 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### C. Purchasing & costing

| # | Capability | M | Rw | Fd | Lv | Sq | LS | Od | EN | Zh | B1 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| C1 | PO lifecycle | ✅ | 🟡 | ✅ | 🟡 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| C2 | Goods receipt incl. partial | ✅ | ? | 🟡 | ? | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| C3 | Supplier returns / RMA | ✅ | ✅ | ? | ❌ | ❌ | ✅ | ? | ✅ | 🟡 | ✅ |
| C4 | Landed costs | ❌ | ? | ? | ❌ | 🟡 | ✅ | ✅ | ✅ | ✅ | ✅ |
| C5 | Costing methods (WAC/FIFO) | ❌ | ? | 🟡 | 🟡 | 🟡 | ✅ | ✅ | ✅ | ✅ | ✅ |
| C6 | Three-way match | 🔶 | ? | ❌ | ❌ | ❌ | ❌ | ✅ | 🟡 | 🟡 | 🟡 |
| C7 | Supplier scorecards | ✅ | 🟡 | ❌ | ❌ | 🟡 | 🟡 | ✅ | ✅ | ❌ | ? |

### D. B2B / wholesale — a Madar persona

| # | Capability | M | Rw | Fd | Lv | Sq | LS | Od | EN | Zh | B1 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| D1 | Credit sales + limits + terms | ❌ | ❌ | ? | ❌ | ❌ | ✅ | 🟡 | ✅ | ✅ | ✅ |
| D2 | AR aging | ❌ | ? | ? | ❌ | 🟡 | 🟡 | ? | ✅ | ✅ | ✅ |
| D3 | Customer statements | ❌ | 🟡 | ? | ❌ | 🟡 | 🟡 | ? | ✅ | ✅ | 🟡 |
| D4 | Price lists / customer tiers | ❌ | ? | ? | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| D5 | Quote → order → invoice | ❌ | 🟡 | ❌ | ❌ | ✅ | 🟡 | ✅ | ✅ | ✅ | 🟡 |
| D6 | Backorders | ❌ | ? | ❌ | ❌ | ❌ | ✅ | ? | ✅ | ✅ | ✅ |
| D7 | Delivery notes | ❌ | ? | ? | ❌ | 🟡 | ✅ | ? | ✅ | ✅ | ✅ |
| D8 | Min-order / case quantities | ❌ | ? | ? | ❌ | 🟡 | ✅ | ? | 🟡 | ❌ | ? |

### E. Restaurant — a Madar persona

| # | Capability | M | Rw | Fd | Lv | Sq | LS | Od | EN | Zh | B1 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| E1 | Kitchen display system | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | 🟡 | ❌ | 🟡 |
| E2 | Tables / floor plan | ❌ | ❌ | ✅ | 🟡 | ✅ | ❌ | ✅ | 🟡 | 🟡 | 🟡 |
| E3 | Modifiers & combos | ❌ | 🟡 | ✅ | ✅ | ✅ | ❌ | ✅ | 🟡 | ❌ | ? |
| E4 | Kitchen printer routing | ❌ | 🟡 | ✅ | ✅ | ✅ | ❌ | ✅ | 🟡 | ❌ | 🟡 |
| E5 | Order types (dine-in/takeaway/delivery) | ❌ | 🟡 | ✅ | ✅ | ✅ | ❌ | 🟡 | 🟡 | ❌ | ? |
| E6 | Aggregators (Talabat/Jahez/Careem…) | ❌ | ❌ | ✅ | 🟡 | ✅ | ❌ | ✅ | ❌ | ❌ | ? |
| E7 | Recipe / ingredient depletion + costing | ❌ | ? | ✅ | 🟡 | 🟡 | ❌ | ❌ | 🟡 | 🟡 | ? |
| E8 | Menu scheduling / time-based pricing | ❌ | ? | ✅ | ❌ | ✅ | ❌ | ? | 🟡 | ❌ | 🟡 |

### F. Pharmacy — a Madar persona

| # | Capability | M | Rw | Fd | Lv | Sq | LS | Od | EN | Zh | B1 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F1 | FEFO / expiry enforcement at sale | 🔶 | ? | ❌ | ❌ | ❌ | ❌ | ✅ | 🟡 | ✅ | 🟡 |
| F2 | Controlled-substance flags | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 🟡 | ❌ | ❌ | ? |
| F3 | Insurance claims | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 🟡 | ? | ❌ | ? |
| F4 | Prescription tracking | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 🟡 | ✅ | ❌ | ? |
| F5 | Regulator integration (RSD/Wasfaty) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ? | ❌ | ❌ | ? |

**Read this group carefully:** almost nobody serves pharmacy. Rewaa — the closest competitor — has *no pharmacy vertical at all*. Batch/expiry + FEFO + controlled-substance flags would make Madar the only Arabic-first pharmacy-capable POS in this comparison.

### G. Promotions & customer

| # | Capability | M | Rw | Fd | Lv | Sq | LS | Od | EN | Zh | B1 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| G1 | Promotions engine (BOGO/coupons/time) | ❌ | 🟡 | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | 🟡 | 🟡 |
| G2 | Loyalty | 🔶 | 🟡 | ✅ | 🟡 | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 |
| G3 | Segmentation | 🔶 | ? | 🟡 | 🟡 | ✅ | ✅ | ? | 🟡 | 🟡 | 🟡 |
| G4 | SMS/WhatsApp campaigns | ❌ | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |

### H. Omnichannel / e-commerce

| # | Capability | M | Rw | Fd | Lv | Sq | LS | Od | EN | Zh | B1 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| H1 | Native storefront | 🚫 | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| H2 | Connectors (Salla/Zid/Shopify/Woo) | ❌ | 🟡 | ? | 🟡 | 🟡 | ✅ | 🟡 | 🟡 | 🟡 | 🟡 |
| H3 | Click & collect | ❌ | ? | 🟡 | ? | ✅ | ✅ | ? | ? | ✅ | ? |

### I. Accounting & finance

| # | Capability | M | Rw | Fd | Lv | Sq | LS | Od | EN | Zh | B1 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| I1 | Full general ledger | 🚫 | 🟡 | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| I2 | AP/AR beyond POS | ❌ | 🟡 | ✅ | ❌ | 🟡 | 🟡 | ✅ | ✅ | ✅ | ✅ |
| I3 | Bank reconciliation | 🔶 | ? | ✅ | ❌ | 🟡 | 🟡 | ✅ | ✅ | ✅ | ✅ |
| I4 | Accounting connectors (QB/Xero) | 🔶 | ❌ | ✅ | 🟡 | ✅ | ✅ | ❌ | 🟡 | ✅ | ? |
| I5 | VAT / tax reporting | ✅ | ✅ | ✅ | 🟡 | 🟡 | ✅ | ✅ | ✅ | ✅ | ✅ |

### J. Compliance & e-invoicing

| # | Capability | M | Rw | Fd | Lv | Sq | LS | Od | EN | Zh | B1 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| J1 | **ZATCA Phase 2 (KSA)** | 🔶 | ✅ | 🟡 | ❌ | ❌ | 🟡 | ✅ | 🟡 | ✅ | 🟡 |
| J2 | Egypt ETA | 🔶 | ❌ | ? | ❌ | ❌ | ❌ | ✅ | 🟡 | 🟡 | 🟡 |
| J3 | UAE e-invoicing readiness | 🔶 | ❌ | ? | ❌ | ❌ | ❌ | 🟡 | 🟡 | 🟡 | ? |
| J4 | Immutable audit trail | ✅ | ? | 🟡 | ? | 🟡 | 🟡 | ? | 🟡 | ✅ | ✅ |
| J5 | Data protection (PDPL/GDPR) tooling | 🔶 | ? | ? | 🟡 | ✅ | ✅ | ? | 🟡 | 🟡 | 🟡 |

### K. Payments & hardware

| # | Capability | M | Rw | Fd | Lv | Sq | LS | Od | EN | Zh | B1 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| K1 | Card gateway / acquiring | 🚫 | ✅ | ✅ | 🟡 | ✅ | ✅ | ✅ | 🟡 | 🟡 | 🟡 |
| K2 | SoftPOS (tap-to-phone) | 🚫 | ✅ | ? | 🟡 | ✅ | ✅ | ? | ❌ | 🟡 | 🟡 |
| K3 | Certified hardware ecosystem | 🟡 | ✅ | ✅ | 🟡 | ✅ | ✅ | ✅ | ❌ | ✅ | 🟡 |

### L. Platform & integrations

| # | Capability | M | Rw | Fd | Lv | Sq | LS | Od | EN | Zh | B1 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| L1 | Public API | 🔶 | 🟡 | ✅ | ✅ | ✅ | ✅ | 🟡 | ✅ | ✅ | ✅ |
| L2 | Webhooks | 🔶 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| L3 | App marketplace | ❌ | 🟡 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 |
| L4 | Bulk import/export | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### M. Localization — Madar's home turf

| # | Capability | M | Rw | Fd | Lv | Sq | LS | Od | EN | Zh | B1 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| M1 | Arabic UI / full RTL | ✅ | ✅ | ✅ | 🟡 | ❌ | ❌ | ? | 🟡 | ✅ | ✅ |
| M2 | Bilingual AR/EN documents | ✅ | 🟡 | ✅ | ? | ❌ | ❌ | 🟡 | 🟡 | ✅ | ✅ |
| M3 | Multi-currency | ✅ | ❌ | ? | ❌ | ❌ | 🟡 | ✅ | ✅ | ✅ | ✅ |
| M4 | Local VAT regimes (GCC/Egypt) | ✅ | ❌ | 🟡 | 🟡 | ❌ | ❌ | ✅ | 🟡 | 🟡 | ✅ |

### N. Multi-branch & franchise

| # | Capability | M | Rw | Fd | Lv | Sq | LS | Od | EN | Zh | B1 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| N1 | Branch management | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| N2 | Central price control + overrides | ✅ | 🟡 | 🟡 | ✅ | ✅ | ✅ | 🟡 | 🟡 | 🟡 | ? |
| N3 | Franchise / consolidated reporting | ❌ | 🟡 | ✅ | ✅ | ✅ | 🟡 | ✅ | ✅ | 🟡 | ? |
| N4 | Warehouse-vs-store location types | ❌ | ? | ✅ | ? | ❌ | 🟡 | ? | 🟡 | 🟡 | 🟡 |

### O. Reporting & BI

| # | Capability | M | Rw | Fd | Lv | Sq | LS | Od | EN | Zh | B1 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| O1 | Real-time dashboards | ✅ | 🟡 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| O2 | Custom report/dashboard builder | 🔶 | ❌ | ✅ | 🟡 | ✅ | ✅ | 🟡 | ✅ | 🟡 | ✅ |
| O3 | Scheduled reports | ✅ | ? | ✅ | ? | ❌ | ✅ | ? | ✅ | ✅ | ✅ |
| O4 | Inventory analytics (GMROI/sell-through/aging) | 🟡 | ? | ❌ | 🟡 | 🟡 | ✅ | ? | 🟡 | 🟡 | 🟡 |
| O5 | Customer analytics (LTV/cohorts) | 🟡 | ❌ | ? | 🟡 | 🟡 | 🟡 | ? | 🟡 | 🟡 | ? |

### P. Security & admin

| # | Capability | M | Rw | Fd | Lv | Sq | LS | Od | EN | Zh | B1 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| P1 | Configurable roles matrix | 🔶 | ✅ | ✅ | 🟡 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| P2 | Audit logs | ✅ | ? | 🟡 | ? | 🟡 | ✅ | 🟡 | 🟡 | ✅ | ✅ |
| P3 | SSO / MFA | 🟡 | ? | ? | ? | 🟡 | ✅ | 🟡 | ✅ | ✅ | 🟡 |
| P4 | Data export & deletion tooling | 🔶 | 🟡 | 🟡 | 🟡 | ✅ | ✅ | ✅ | 🟡 | ✅ | 🟡 |

## 6. Gap register

Priority rubric: **P0** legally market-blocking · **P1** table-stakes persona blocker (≥70% of competitors have it AND absence blocks a persona's daily workflow) · **P2** competitive parity (workarounds exist) · **P3** differentiator / watch. Effort S/M/L/XL estimated against Madar's architecture. Non-goals are excluded from ranking (see §3).

| ID | Gap (matrix rows) | Class | Priority | Effort | Personas blocked | Who has it | Recommendation |
|---|---|---|---|---|---|---|---|
| G-01 | **ZATCA Phase 2 e-invoicing** (J1) | Planned-not-built (deferred) | **P0** | L | All KSA personas | Rewaa, Odoo, Zoho native; Foodics B2C | **Do next** — legally blocking in KSA since Jun 2026 (§4) |
| G-02 | **Egypt ETA e-receipts + e-invoicing** (J2) | Planned-not-built (deferred) | **P0**¹ | L | All EG personas | Odoo native | **Do next**¹ — blocking for VAT-registered EG tenants |
| G-03 | **PDPL/data-protection pack** — residency enforcement, export/delete tooling (A29/A30), DPO process (J5, P4) | Planned-not-built | P1 | M | All (KSA/EG) | Square, Lightspeed (GDPR) | **Do next** — Saudi PDPL enforced; Egypt grace ends Oct 2026 |
| G-04 | **Wholesale credit pack** — credit sales, credit limits, payment terms, AR aging, statements, price tiers (D1–D4) | Missing | P1 | XL | **Wholesaler** (persona currently unserved) | Lightspeed, ERPNext, Zoho, SAP B1 — **Rewaa lacks it** | **Do next** — both a persona blocker and a differentiator vs Rewaa |
| G-05 | **Modifiers/combos + order types** (E3, E5) | Missing | P1 | M | Restaurant | Foodics, Loyverse (free), Square, Odoo | **Do next** — cheapest restaurant credibility step |
| G-06 | **KDS + kitchen printer routing** (E1, E4) | Missing | P1 | L | Restaurant | Foodics, Loyverse (free), Square, Odoo | **Do next** after G-05 |
| G-07 | **Recipe / ingredient depletion + costing** (E7) | Missing | P1 | L | Restaurant | Foodics; Square (beta) | Backlog — *not BOM*: sale-time ledger multipliers on existing `stock_movements`, no production orders |
| G-08 | **Product variants** (B1) | Planned-not-built | P1 | L | Retailer | 7 of 9 | **Do next** — schedule the existing plan |
| G-09 | **Batch/expiry + FEFO at sale** (B4, F1) | Planned-not-built | P1 | L | **Pharmacy** (+grocery) | Rewaa, Odoo, ERPNext, Zoho, SAP B1 | **Do next** — gateway to the pharmacy white space (§5-F) |
| G-10 | **Promotions engine + loyalty** (G1, G2) | Missing / Phase-4-planned | P1 | L | Retail + restaurant | Majority ✅ | **Do next** — pull loyalty forward from Phase 4 |
| G-11 | Cycle counts + stock-levels pivot (B6, B10) | Planned-not-built (specced PAGES §17, §20) | P2 | M | Retail, pharmacy | 8 of 9 | Backlog (high) — spec exists, recount movement type exists |
| G-12 | Customer-facing display (A10) | Missing | P2 | M | All POS | 7 of 9 | Backlog |
| G-13 | Multi-UoM case/each conversions (B2) | Missing | P2 | M | Wholesaler | ERP tier + Foodics | Backlog — bundle with G-04 |
| G-14 | Bundles / composite products (B3) | Missing | P2 | M | Retail | 7 of 9 | Backlog |
| G-15 | WAC/FIFO costing + landed costs (C4, C5) | Missing | P2 | L | Wholesaler, retail | ERP tier + Lightspeed | Backlog — improves COGS credibility of P&L |
| G-16 | Barcode label printing (B9) | Missing | P2 | S–M | Retail, pharmacy | Rewaa, Lightspeed, Zoho | Backlog — quick win |
| G-17 | Serial numbers (B5) | Planned-not-built | P2 | M | Electronics retail | 5 of 9 | Backlog |
| G-18 | Gift cards (A2) | Missing | P2 | M | Retail | 5 of 9 | Backlog — reuse store-credit ledger |
| G-19 | WhatsApp receipts + campaigns (A6, G4) | Missing | P2 | M | All (MENA norm) | Regional expectation | Backlog — planned Twilio/WhatsApp notifications are adjacent |
| G-20 | Public API + webhooks (L1, L2) | Planned (Phase 4) | P2² | L | All | **9 of 9 competitors** | Backlog (high) — gates G-21, aggregators, marketplace |
| G-21 | Salla/Zid connectors (H2) | Missing | P2 | M | Retail | Rewaa; ERPNext (3rd-party) | Backlog — after G-20 |
| G-22 | Weighing-scale support (A7) | Missing | P2 | S–M | Grocery retail | Rewaa, Loyverse, Square, Zoho | Backlog — start with weight-embedded barcodes (S) |
| G-23 | Bank statement reconciliation (I3) | Planned-not-built (billing-flow §Phase 2) | P2 | M | Platform ops + tenants | ERP tier | Backlog (high) — also de-costs Madar's own verification ops |
| G-24 | GMROI / sell-through / stock-aging reports (O4) | Partial | P2 | S | Retail | Lightspeed | Backlog — quick win, plain SQL on existing ledger |
| G-25 | Sales orders, delivery notes, backorders (D5–D7) | Missing | P2 | L | Wholesaler | ERP tier | Backlog — phase 2 of G-04 |
| G-26 | Configurable roles/permission matrix (P1) | Planned-not-built | P2 | M | All | 8 of 9 | Backlog |
| G-27 | Custom dashboards / report builder (O2) | Planned-not-built (PAGES §42) | P3 | L | Owner persona | 6 of 9 | Watch |
| G-28 | Pharmacy clinical features — controlled-substance flags, insurance, prescriptions, RSD/Wasfaty (F2–F5) | Missing | P3³ | L–XL | Pharmacy | **Nobody** (white space) | Watch — F2 flags alone are S effort and could ride G-09 |
| G-29 | Franchise/consolidated multi-entity + warehouse location types (N3, N4) | Missing | P3 | L | Growing chains | Mixed | Watch |
| G-30 | App marketplace (L3) | Missing | P3 | XL | — | 8 of 9 | Watch — needs G-20 + ecosystem gravity first |
| G-31 | Tenant SSO (P3) | Planned (higher tiers) | P3 | M | Larger tenants | ERP tier | Watch |
| G-32 | Certified hardware program (K3) | Partial | P3 | — | All POS | Most | Watch — PRD §12 open question (sell/rent/certify) |

¹ G-02 is P0 **only if Egypt is a launch market** — launch markets are an open question in PRD §12. This analysis is the trigger to decide: if Egypt is in, G-02 is P0; if not, it drops to P2 until entry.
² G-20 fails the strict P1 test (no daily workflow blocked) but is the single most universal competitor capability (9/9) and a prerequisite for three other gaps — treat as strategic P2, scheduled early.
³ G-28 is P3 by the rubric (minority feature) but is the clearest **differentiation** opportunity in the whole analysis: no competitor — including Rewaa — serves pharmacy. Pairing G-09 (P1) with F2 flags would make Madar the only Arabic-first pharmacy-capable POS in this set.

**Reaffirmed non-goals** (surfaced by the matrix, deliberately not ranked): card gateway/softPOS (K1/K2 — every competitor monetizes payments; Madar's zero-fee bank-transfer model is the counter-position), full GL (I1 — Foodics/Odoo/ERPNext/Zoho/SAP have it; Madar exports instead), native storefront (H1), AP beyond POS (I2). See §3 for the sales answers.

## 7. Top-10 recommendations

Ordered by priority tier, then effort ascending within tier:

1. **G-01 ZATCA Phase 2** (P0, L) — build the shared e-invoicing module KSA-first: QR/UUID/cryptographic stamp/hash chain on B2C receipts with 24h reporting; B2B clearance path for the wholesale flow. Without it Madar cannot legally serve VAT-registered Saudi tenants — and Rewaa, Zoho, and Odoo all have it natively.
2. **G-02 Egypt ETA** (P0¹, L) — decide launch markets first (PRD §12); if Egypt is in, e-receipt integration (signature, QR, sequential numbering, GS1 coding) rides the same shared e-invoicing module as G-01.
3. **G-03 PDPL pack** (P1, M) — enforce the already-designed data-residency config, build admin A29/A30 (export/delete), define the support-access model. Saudi PDPL counts foreign remote access as a transfer; Egypt's licensing regime bites 31 Oct 2026.
4. **G-05 Modifiers + order types** (P1, M) — the cheapest step from "POS that restaurants tolerate" to "restaurant POS": priced modifiers/combos and dine-in/takeaway/delivery types (a field + kitchen note + reporting dimension).
5. **G-08 Variants** (P1, L) — already planned; schedule it. Every retail competitor has matrix variants; it blocks apparel/footwear retailers today. Touches catalog, POS, ledger, offline sync — do it before the catalog grows more surface area.
6. **G-09 Batch/expiry + FEFO** (P1, L) — pharmacy persona is unserved without it, and it opens the clearest white space in the market (§5-F, note ³). Add controlled-substance flags (S) while in there.
7. **G-10 Promotions + loyalty** (P1, L) — BOGO/time-based/coupon promotions engine plus the Phase-4 loyalty pulled forward. Permission-gated manual discounts are not a promotions strategy; majority of competitors ship one.
8. **G-06 KDS + kitchen routing** (P1, L) — Loyverse gives a KDS away free; Foodics/Square/Odoo all have one. Socket.io infrastructure already exists for realtime.
9. **G-07 Recipe depletion** (P1, L) — ingredient-level depletion at sale time as `stock_movements` multipliers (explicitly not BOM/manufacturing: no production orders, no work-in-progress). Without it, inventory for restaurants is decorative.
10. **G-04 Wholesale credit pack** (P1, XL) — credit sales with limits and terms, AR aging, statements, customer price tiers. The wholesaler persona is currently unserved by Madar **and by Rewaa** — the largest strategic prize in this analysis, and the natural beneficiary of the B2B ZATCA clearance path built in G-01.

**Cheap wins to slot between larger items:** G-24 inventory analytics (S — plain SQL), G-16 label printing (S–M), G-22 weight-embedded barcodes (S), G-11 cycle counts (M — already specced).

## 8. Appendix

### A. Madar column evidence

| ID | Madar | Evidence / ref |
|---|---|---|
| A1 | ✅ | Cash, bank transfer, manual card, store credit, split tender (PRD §4.1; `SalePayment` model; tasks.md Ph1–2) |
| A2 | ❌ | `StoreCreditLedger` exists; gift cards as sellable/redeemable instruments not planned anywhere |
| A3 | ✅ | `HeldSale`/`HeldSaleLine` models, held-sales tray (PAGES §7–12) |
| A4 | ✅ | `SaleRefund*` models, full + partial tied to original receipt |
| A5 | ✅ | Line + cart discounts, permission-gated (PRD §4.1) |
| A6 | ✅ | Thermal 58/80mm, A4, email, SMS, QR, PDF, bilingual (PAGES); WhatsApp delivery not specified (Twilio WhatsApp notifications planned 🔶) |
| A7 | 🟡 | Barcode scan built; weighing-scale integration not planned |
| A8 | ✅ | `CashierShift` model: float, variance, manager PIN, Z-report |
| A9 | ✅ | PWA + IndexedDB queue, idempotent replay, `SyncConflict` incl. `price_drift`/`sequence_gap` (ADR 0005) |
| A10 | ❌ | Customer-facing display not planned |
| B1 | 🔶 | Variants in PRD §4.2; no schema, no code |
| B2 | ❌ | Single UoM per product (translatable label only); conversions not planned |
| B3 | ❌ | Bundles/composites not planned |
| B4 | 🔶 | Batch/expiry "toggleable per category" in PRD; no schema |
| B5 | 🔶 | Serial tracking in PRD; no schema |
| B6 | 🔶 | Cycle counts/stock-take specced (PAGES §20); no route, no module (`cycle_count` movement reason exists) |
| B7 | ✅ | `StockTransfer` draft→in-transit→received, discrepancy flags |
| B8 | ✅ | Per-branch reorder points + on-demand 30-day-avg suggestions (proactive daily job partial) |
| B9 | ❌ | Label design/printing not planned |
| B10 | 🔶 | Stock-levels pivot (PAGES §17) not built; per-product per-branch stock visible ✅ |
| C1 | ✅ | PO draft→send(PDF+email)→confirm→partial receive→close (`PurchaseOrder*`) |
| C2 | ✅ | Partial receiving built; barcode-scan receiving open |
| C3 | ✅ | `SupplierReturn*` RMA with reason codes |
| C4 | ❌ | Landed costs not planned |
| C5 | ❌ | Manual current-cost snapshot into `cogs_snapshot`; no WAC/FIFO engine |
| C6 | 🔶 | Three-way match planned (PRD §4.4); not built |
| C7 | ✅ | Scorecard: fill rate, on-time, lead time, defects (sparklines open) |
| D1–D8 | ❌ | No customer credit sales/limits/terms, AR aging, statements, price tiers, quote→order→invoice, backorders, delivery notes, or MOQ — wholesaler persona unserved (store credit ≠ credit sales; supplier payment terms exist, customer terms don't) |
| E1–E8 | ❌ | No KDS, tables, modifiers (kitchen note only), printer routing, order types, aggregators, recipe depletion, or menu scheduling — restaurant persona has generic POS only |
| F1 | 🔶 | Depends on B4; FEFO-at-sale enforcement unspecified |
| F2–F5 | ❌ | No controlled-substance flags, insurance, prescriptions, or RSD/Wasfaty |
| G1 | ❌ | Manual permission-gated discounts only; no promo engine |
| G2 | 🔶 | Loyalty explicitly Phase 4 (PRD; tasks.md Phase 4 list) |
| G3 | 🔶 | Segmentation Phase 4 (segment chip in PAGES customer profile) |
| G4 | ❌ | Operational notifications only; no marketing campaigns |
| H1 | 🚫 | Storefront = PRD §2.3 non-goal (v1) |
| H2 | ❌ | Salla/Zid/Shopify connectors not planned (QB/Xero/Sheets are accounting, Ph4) |
| H3 | ❌ | Follows from no storefront |
| I1 | 🚫 | Full GL = PRD §2.3 non-goal |
| I2 | ❌ | No AP/AR beyond POS (cash-flow snapshot planned) |
| I3 | 🔶 | Bank statement reconciliation specced (billing-flow, Ph2); not built |
| I4 | 🔶 | QuickBooks/Xero/Sheets connectors Phase 4 |
| I5 | ✅ | Tax report per jurisdiction (built) |
| J1–J3 | 🔶 | E-invoicing deferred in tasks.md Phase 3.6 (#6) — rationale re-tested in §4 |
| J4 | ✅ | DB-level append-only audit (UPDATE/DELETE/TRUNCATE blocked), dual logs |
| J5 | 🔶 | GDPR export/delete = admin A29/A30 not built; data-residency config planned |
| K1 | 🚫 | ADR 0002 — no gateway, ever |
| K2 | 🚫 | SoftPOS implies card acquiring — same ADR 0002 |
| K3 | 🟡 | Thermal print + WebUSB drawer kick built (tasks 3.6 #4); no certified-hardware program (PRD §12 open question) |
| L1 | 🔶 | Public REST API Phase 4 |
| L2 | 🔶 | Webhooks Phase 4 |
| L3 | ❌ | App marketplace not planned |
| L4 | ✅ | CSV import (products/customers), bulk edit, CSV/PDF exports (XLSX deferred) |
| M1 | ✅ | EN/AR equals, full RTL, logical CSS, Arabic-Indic numerals, Hijri toggle |
| M2 | ✅ | Bilingual or per-branch single-language receipts |
| M3 | ✅ | Per-branch currency + snapshot FX (multi-currency rollup report deferred) |
| M4 | ✅ | Configurable tax classes/jurisdictions, inclusive/exclusive |
| N1 | ✅ | Branch CRUD, hours, per-branch staff/pricing/bank accounts |
| N2 | ✅ | Central catalog + optional per-branch price override |
| N3 | ❌ | No franchise/multi-entity consolidation (single tenant = one entity) |
| N4 | ❌ | Branches only; no warehouse-vs-store location types |
| O1 | ✅ | Owner + branch dashboards |
| O2 | 🔶 | Custom dashboard builder (PAGES §42) deferred; report builder not planned |
| O3 | ✅ | `ScheduledReport` + email delivery built |
| O4 | 🟡 | Movers/slow movers + margin analysis built; GMROI/sell-through/stock-aging not |
| O5 | 🟡 | Per-customer LTV/visits built; cohorts not |
| P1 | 🔶 | Fixed `TenantUserRole` enum built; configurable matrix editor deferred |
| P2 | ✅ | Append-only audit logs (tenant viewer UI 🔶) |
| P3 | 🟡 | MFA (TOTP) built; tenant SSO planned for higher tiers |
| P4 | 🔶 | GDPR/CCPA export + delete planned (admin A29/A30 not built) |

### B. Per-competitor research notes & sources

All sources accessed 2026-08-08. Full per-row evidence tables (one rating + evidence line + URL per matrix cell) were produced during research; the load-bearing findings and primary sources are below.

**Rewaa** — rewaa.com, help.platform.rewaatech.com, doc.api.rewaatech.com, wamda.com (Series B). Load-bearing: credit limits "not currently available" (help center); SAR-only explicitly (Zid integration doc); batch+expiry, serials, variants, label printing, offline-300-receipts-ZATCA-compliant all documented in help center; no pharmacy vertical on rewaa.com/en/retail-types/; loyalty only via Bonat app; accounting is a separate installable app; Smart Invoice Reader OCR; $45M Series B (Dec 2025) funds AI reorder/PO-matching.

**Foodics** — foodics.com (rms-features, marketplace, kitchen-display-screen, pay-at-table, one, enterprise, business-intelligence, accounting-for-restaurants, zatca-e-invoicing-2nd-phase, online), pay.foodics.com, apidocs.foodics.com, help.foodics.com. Load-bearing: full restaurant stack native (KDS, tables, modifiers/combos, printer routing, aggregators via Jahez/Careem/Noon + UrbanPiper/Deliverect); recipe costing with ingredient-unit conversions; Foodics Accounting includes GL + bank rec; ZATCA B2C native, B2B via InvoiceQ; no retail variants/batch/serials (F&B-only); many help pages 403'd — cited via search cache where so.

**Loyverse** — loyverse.com (pricing, features, advanced-inventory, kitchen-display-system, loyalty-program, multi-store-pos, marketplace), developer.loyverse.com, help.loyverse.com, loyverse.town (official community). Load-bearing: free core = POS + Dashboard + **KDS** + **Customer Display**; modifiers and variants free; Advanced Inventory ($25/mo) holds counts/transfers/PO/labels/production; no gift cards, no promo engine, no batch/expiry (community-confirmed); Tap to Pay US-only; no ZATCA/ETA in official marketplace.

**Square** — squareup.com (pricing, franchises, banking, loyalty, marketing, invoices, online-store), developer.squareup.com, community.squareup.com. Load-bearing: Oct 2025 pricing unification (Free/$49/$149); 8 processing countries, no MENA, no Arabic; no store-credit balance, no wholesale price tiers, no backorders, no return-to-vendor (all community-confirmed); restaurant stack complete incl. floor plans and native DoorDash/UberEats/Grubhub; Square Recipes beta + MarketMan (Apr 2026); Activity Log excludes backend changes; site is bot-gated — some rows synthesized from indexed pages + official community.

**Lightspeed Retail (X-Series)** — lightspeedhq.com (pricing, inventory-management, reporting, integrations), x-series-support.lightspeedhq.com, x-series-api.lightspeedhq.com. Load-bearing: expiry dates **explicitly not supported** ("It is not possible to add an expiry date to a product"); on-account credit sales with limits + price books + backorders + landed costs + WAC/FIFO all native; GMROI/sell-through/aging in Insights (Plus); EN/FR/NL only; ZATCA via third-party "Hyperspace" documented on Lightspeed's own support site; NuORDER B2B marketplace bundled.

**Odoo** — odoo.com/pricing, odoo.com/app/*, odoo.com/documentation/18.0 (fiscal_localizations/saudi_arabia, egypt, united_arab_emirates; point_of_sale/*; inventory landed_costs, expiration_dates, reordering_rules; purchase control_bills), apps.odoo.com. Load-bearing: native `l10n_sa_edi` (ZATCA Phase 2 via Fatoora) + `l10n_sa_pos`; native Egypt ETA (`l10n_eg_edi_eta`, requires USB signing key + local proxy); UAE localization generates EN/AR bilingual invoices; FEFO enforcement, landed costs, three-way match, FIFO/AVCO/LIFO/Standard costing all native; restaurant stack native (Preparation Display Enterprise; UrbanPiper hub for 20+ aggregators incl. Talabat/Jahez/HungerStation); **external API gated to the Custom plan**. WebSearch was unavailable for this agent — several `?` cells (AR aging, statements, backorders, delivery notes, Arabic UI) are long-standing standard Odoo features that simply weren't fetch-verified; treat them as "very likely ✅, unverified".

**ERPNext** — docs.frappe.io/erpnext (point-of-sale, item, purchase-order, accounts-receivable, supplier-scorecard, loyalty-program, coupon-code, stock-reconciliation, united_arab_emirates), frappe.io/erpnext/version-16, cloud.frappe.io, github.com (ERPGulf/zatca_erpgulf, Axentorllc/erpnext_egypt_compliance, POS-Awesome, POSNext, erpnext-restaurant), discuss.frappe.io. Load-bearing: deep native B2B (credit limits, AR aging, statements, price lists, backorders, delivery notes) and purchasing (landed costs, FIFO/MA, supplier scorecards); **no working native offline POS**; RTL incomplete (open requests); ZATCA/ETA third-party only; restaurant features community-app only; Salla/Zid connectors exist as third-party apps.

**Zoho** — zoho.com (books/pricing, inventory/pricing, en-us/pos, sa/books/e-invoicing, blog/pos/zoho-pos-for-saudi, commerce, privacy, accounts/oneauth), help.zoho.com. Load-bearing: **Zoho POS Saudi edition launched 1 Dec 2025** — full Arabic RTL, 4 bilingual invoice layouts, from SAR 39/mo; Books is ZATCA-approved Phase 2 with KSA data center; Inventory has batch+expiry with auto-FEFO, serials, UoM conversion, landed costs, FIFO/WAC; full B2B via Books (credit limits, AR aging, statements, backorders, Delivery Challan); zero restaurant/pharmacy features; Zoho Payments + Tap-to-Pay US/India-only; no Salla/Zid.

**SAP Business One** — sap.com/products/erp/business-one (features), help.sap.com/docs/SAP_BUSINESS_ONE (10.0; Central-MENA localization pages updated 2026-05-08), help.sap.com/docs/SAP_CUSTOMER_CHECKOUT_CLOUD_POS (v2602), community.sap.com, ecosire.com, b1-solutions.com, seidor.com. Load-bearing: quote-only partner-channel licensing; Arabic UI + per-customer document language; native MENA VAT tax reports but **no native ZATCA/ETA e-invoicing** (partner add-ons only — full-text search of the B1 help corpus finds native e-invoicing for IT/MX/PL/RU/AR/HU/DE/ES, none for KSA/EG/AE); B2B ceiling confirmed (credit + commitment limits with authorized release, aging, discount groups, backorder processing, MRP); POS via SAP Customer Checkout (split tender, gift cards, table-service mode); Service Layer webhooks new in FP 2602.

**Compliance research** — KPMG (2026-07-28), VATupdate (2026-07-27, 2026-08-05), zatca.gov.sa (penalties), e-invoicing.org/egypt, Avalara, wafeq.com, EY UAE alert, tax.gov.ae, mof.gov.ae, Chambers Global Practice Guides 2026 (KSA + Egypt), Baker McKenzie (Jan 2026), Amereller. Caveat: several primary regulator pages blocked automated access; Egypt's exact e-receipt revenue bands and the UAE's 2027 mandatory dates rest on tax-tech vendor content and are flagged as such in §4.

### C. Known research limitations

- Ratings reflect official public documentation as of 2026-08-08; `?` means "could not verify", not "does not exist". Before betting a roadmap item on a competitor's weakness, confirm the `?`/🟡 cells in a live demo.
- Three research agents lost WebSearch mid-session and fell back to direct fetches — Odoo, ERPNext, Zoho, SAP B1 and compliance rows flagged inline carry that caveat.
- Square's and parts of Foodics' documentation are bot-gated; their rows synthesize indexed official pages and official community answers.
