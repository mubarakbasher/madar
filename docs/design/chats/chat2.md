# Build Process

_Started 2026-05-13 21:25 UTC_

---

## User

<system-info comment="Only acknowledge these if relevant">
Project title is now "Madar"
User is viewing file: Madar.html
Current date is now May 13, 2026
</system-info>

<default aesthetic>
If no references, art direction or design systems were provided, use this default professional modern, minimal aesthetic as a base. Declare your choice out loud so you stick to it. Guidance:
- Choose a type pairing from web-safe set or Google Fonts. Helvetica is a good choice. Avoid hard-to-read or overly stylized fonts. Use 1-3 fonts only.
- Foreground and background: choose a color tone (warm, cool, neutral, something in-between). Use subtly-toned whites and blacks; avoid saturations above 0.02 for whites.
- Accents: choose 0-2 additional accent colors using oklch. All accents should share same chroma and lightness; vary hue.
- NEVER write out an SVG yourself that's more complicated than a square, circle, diamond, etc.
- For imagery, never hand-draw SVGs; use subtly-striped SVG placeholders instead with monospace explainers for what should be dropped there (e.g. “product shot”)

CRITICAL: ignore default aesthetic entirely if given other aesthetic instructions like reference images, design systems or guidance, or if there are files in the project already.
</default aesthetic>

<pasted_text name="Pasted text (1228 lines)">
# PAGES.md — Page-by-Page Design Specification

This document specifies the layout, components, copy, and visual details for every page in both the tenant app (`apps/web`) and the super-admin app (`apps/admin`).

> **Read first:** `CLAUDE.md` (design system, tokens, principles) and `PRD.md` (product scope).
>
> **Design language:** Claude-inspired — warm paper backgrounds, editorial serif headings, calm density, terracotta accent for tenant app / slate teal for admin app.

---

## How to Read This Document

Each page entry includes:

- **Route** — URL path
- **Audience** — who uses it
- **Layout** — high-level structure
- **Hero element** — the one thing that dominates the page
- **Sections** — block-by-block breakdown
- **States** — empty, loading, error, success variants
- **Bilingual notes** — anything special for Arabic/RTL
- **Critical interactions** — must-work behaviors

**Universal rules** (apply to every page, not repeated each time):
- Page max-width: 1280px centered, 32–48px gutters
- All text via `useTranslations()`, no hardcoded strings
- All colors/spacing/radius via design tokens
- Test in light + dark + LTR + RTL
- Empty/loading/error states for every list and form

---

# TENANT APP — `apps/web`

## 0. Global Shell

Every authenticated page sits in this shell.

### Top Bar
- **Left (start side):** Tenant logo/name in display serif at `text-h3`. Tap → home.
- **Center:** Branch switcher pill if user has access to multiple branches. Format: "Riyadh Main · Open" with a small status dot (green = open shift, grey = closed). Tap to switch.
- **Right (end side):** Search icon (global product/customer search), notifications bell with count badge, locale toggle (EN / ع), user avatar menu.
- Height: 64px. Background `--color-surface`. Bottom border `--color-line`.

### Sidebar (collapsible)
- Width: 240px expanded, 64px collapsed.
- Background: `--color-surface-alt`.
- Sections with display-serif uppercase tracked labels: "Sell", "Manage", "Analyze", "Settings".
- Active item: `--color-accent-soft` background, `--color-accent` text, `--radius-md`.
- Icons: Lucide, 20px, inherit text color.
- Collapsed state shows only icons with tooltips.

### Main Content Area
- Background: `--color-bg` (warm off-white).
- Padding: `--space-6` (32px) on desktop, `--space-4` (16px) on mobile.
- Page title: display serif `text-h1`, followed by optional muted subtitle in body font.

### Mobile Nav
- Bottom tab bar replaces sidebar below 768px.
- Five tabs max: Sell, Inventory, Reports, More, Profile.
- 56px tall, `--color-surface` background, top border `--color-line`.

---

## Public / Auth Pages

### 1. Landing Page

**Route:** `/`
**Audience:** Visitors
**Layout:** Full-width single column, hero + 3 feature sections + CTA

- **Hero:**
  - Background: `--color-bg` with a subtle warm radial gradient toward `--color-surface-alt`.
  - Headline in display serif, 56–72px, max 12 words. Example: "Run your shop the way it should run."
  - Subhead in body font, 20px, muted ink, max 25 words.
  - Two buttons side by side: "Start free trial" (filled accent) and "See how it works" (ghost).
  - Below: small line "14 days free. No card. No commitment."
  - **No hero image.** The typography is the hero.

- **Three feature sections** stacked vertically, each:
  - Editorial layout: oversized number ("01" "02" "03") in display serif at 96px in `--color-ink-subtle`.
  - Section title in display serif at `text-h2`.
  - Body copy at `text-body`, max 60 chars per line.
  - A small illustration or product screenshot on the opposite side (alternating left/right in LTR, flips in RTL).

- **Pricing teaser:** 3-card row with plan names and starting prices. "See full pricing →" link.

- **Final CTA:** Centered, large display headline, "Start free trial" button.

- **Footer:** Minimal. Logo, language toggle, links to terms / privacy / contact.

**Critical:** Landing page must load in under 1.5s on 3G. No video, no large hero images.

---

### 2. Sign Up

**Route:** `/{locale}/signup`
**Audience:** New tenants
**Layout:** Centered card on warm background

- Card: max-width 480px, `--color-surface`, `--radius-lg`, `--shadow-md`, padding `--space-7`.
- Heading in display serif at `text-h1`: "Start your free trial"
- Subhead muted: "14 days, all features, no card required."
- Fields (stacked, full width):
  - Business name (translatable hint: "Your shop's name")
  - Owner full name
  - Email
  - Password (with strength indicator — bars not text)
  - Country (dropdown, drives default currency + tax setup)
  - Preferred language (English / العربية)
- Primary button: "Create account" — full width, 48px tall.
- Below: "Already have an account? Log in" — link in accent.
- Tiny print: "By signing up you agree to our Terms · Privacy" — `text-tiny`, muted.

**States:**
- Error: inline message under field, danger color.
- Submitting: button shows spinner + "Creating your workspace…"
- Success: full-page transition to onboarding wizard.

---

### 3. Login

**Route:** `/{locale}/login`
**Audience:** Existing users
**Layout:** Same centered card pattern as signup

- Heading: "Welcome back"
- Subhead: "Sign in to your workspace"
- Fields: Email, Password
- "Forgot password?" link below password, end-aligned
- Primary button: "Sign in"
- Below: "New here? Start a free trial" link
- If MFA enabled: second screen with 6-digit code input (use individual boxes, monospaced, large)

---

### 4. Forgot Password / Reset

**Route:** `/{locale}/forgot-password`, `/{locale}/reset-password?token=…`
**Audience:** Locked-out users

- Step 1: Email field, "Send reset link" button. After submit: "Check your email" success state with envelope icon.
- Step 2 (from email): New password + confirm. "Reset password" button. Success → redirect to login.

---

### 5. Email Verification

**Route:** `/{locale}/verify-email?token=…`
**Audience:** New signups

- Card with checkmark icon (success color), heading "Email verified", body "You can now access your workspace", primary button "Go to dashboard".
- Error variant if token expired: "This link expired", with "Send a new link" button.

---

## Onboarding Pages

### 6. Tenant Setup Wizard

**Route:** `/{locale}/onboarding`
**Audience:** First-time tenant after signup
**Layout:** Multi-step wizard, no sidebar/topbar yet

- Progress: simple step dots at top, 3 steps: "Business" → "Branch" → "Products"
- Each step a centered card, 600px max-width

**Step 1: Business**
- Heading: "Tell us about your business"
- Fields: Business type (dropdown: Retail, Restaurant, Pharmacy, Wholesale, Other), Currency (auto-filled from country, editable), Timezone, Tax-inclusive pricing (toggle), Fiscal year start (month picker)
- "Continue" button bottom-end

**Step 2: First Branch**
- Heading: "Where is your first branch?"
- Fields: Branch name (e.g., "Main Store"), Address (multi-line), Phone (optional)
- "Continue"

**Step 3: First Products (optional)**
- Heading: "Add a few products to get started"
- Two paths shown as choice cards:
  - "Add products one by one" → opens inline form
  - "Import from a list" → opens paste-text-or-upload-CSV modal
  - "Skip for now" — ghost button at end

- On completion: confetti-free transition to dashboard with welcome banner: "Welcome! Your trial ends on [date] · Tour the app →"

**Critical:** Each step is independently saveable (auto-save on field blur). User can close browser and resume.

---

## POS Pages

### 7. POS Sell Screen

**Route:** `/{locale}/pos`
**Audience:** Cashier
**Layout:** Two-column split — product area + cart, no sidebar in POS mode

**This is the most important screen in the product. Treat it accordingly.**

- **No top bar in POS mode** — replaced with a slim 48px header: branch name, cashier name, "End shift" button, time.

- **Left/start column (60%):**
  - Search bar at top: large, `text-h3` placeholder "Search or scan barcode…", 56px tall, accent ring on focus, autofocus on page load.
  - Quick category pills below search: horizontal scroll, `--radius-full`, pressed state with accent.
  - Product grid: 4–6 columns depending on viewport. Each tile:
    - Square, `--radius-md`, `--color-surface` background, hover lift.
    - Product image (or initial-based color block fallback).
    - Product name `text-small`, 2-line max, truncate.
    - Price in **display serif** at `text-h3`, tabular numerals.
    - No icons on the tile.
    - Pressed state: 0.97 scale.

- **Right/end column (40%, fixed):**
  - `--color-surface-alt` background, full height.
  - Top: Cart header "Cart" + small "Clear" link if items exist.
  - Cart lines: each line shows quantity stepper, name (truncated), unit price (small, muted), line total (display serif).
  - Tap a line opens a sheet to edit qty, apply line discount, add note.
  - Below cart: subtotal, tax, discount (collapsed unless non-zero), total in **display serif at 56–72px** with currency code.
  - Customer attach button: "Add customer" with person icon. Filled in once attached.
  - Bottom: "Pay" button — full width, 64px tall, `--color-accent`, display serif text "Pay [total]".

- **Empty cart state:** Big muted illustration (shopping basket outline), "Scan or tap a product to start" body text.

**Critical interactions:**
- Barcode scan focuses input, auto-adds product, clears input. No modal.
- "Hold sale" via long-press or menu → moves cart to held-sales tray.
- Held sales tray icon in header with count badge.
- All numeric input via tap (no keyboard required) — cart edit sheet has a number pad.

---

### 8. Payment Screen

**Route:** Modal/sheet opened from POS sell screen
**Audience:** Cashier
**Layout:** Full-height sheet from end-side, 480px wide on desktop, full-screen mobile

- Header: "Payment" title, total in display serif at 48px, customer name if attached, X to close.
- Tabs: Cash · Bank Transfer · Card · Store Credit · Split
- **Cash tab:**
  - Big amount-tendered field, autofocus, opens number pad.
  - Quick-tap chips: "Exact" / next-round-up amounts (e.g., 100, 200, 500).
  - Change due: display serif `text-h2`, success color if positive.
  - "Complete sale" button at bottom, 64px tall, accent.
- **Bank Transfer tab:**
  - QR code (256px square, centered) — encodes tenant's default bank account + amount.
  - Below QR: bank account text in both languages.
  - "Customer has paid" button → opens receipt capture (next screen).
- **Card tab:** Simple text "Process on your card terminal, then enter the approval code below" + approval code input.
- **Split tender:** lets cashier add multiple payment lines summing to total.

---

### 9. Bank Transfer Receipt Capture

**Route:** Modal step after Bank Transfer tab in payment
**Audience:** Cashier
**Layout:** Full sheet, simple form

- Heading: "Capture payment receipt"
- Receipt image: large drop zone or camera button. Min 240px tall. Preview after capture.
- Fields:
  - Bank reference number (text input)
  - Payer name (text input)
  - Transfer date (date picker, defaults to today)
- "Complete sale" button — marks sale `payment_pending`, prints receipt, returns to POS.
- "Skip — verify later" link (ghost) — for cases where customer left receipt and will send later.

---

### 10. Receipt Preview / Reprint

**Route:** `/{locale}/pos/sales/{id}/receipt`
**Audience:** Cashier
**Layout:** Modal showing receipt preview

- Receipt rendered as it would print (58mm or 80mm width per branch setting).
- Buttons: Print, Email, SMS, Download PDF, Done.
- For bank-transfer sales: shows payment status badge ("Awaiting verification", "Verified", "Disputed").

---

### 11. Open Shift

**Route:** `/{locale}/pos/shift/open`
**Audience:** Cashier starting shift
**Layout:** Centered card

- Heading: "Open your shift"
- Field: Opening cash float (number, with currency)
- Field: Notes (optional, multi-line)
- Primary button: "Start shift"
- Below: previous shift summary card if relevant ("Closed yesterday at 21:34 by Ahmed · Variance 0.00 SAR").

---

### 12. Close Shift / Reconciliation

**Route:** `/{locale}/pos/shift/close`
**Audience:** Cashier ending shift
**Layout:** Two-column

- Left: Expected cash (calculated), counted cash (input), variance (auto-calculated, color-coded).
- Right: Sales summary for the shift — count, total, by payment method.
- Bottom: Notes field, "Close shift" button (requires manager PIN if variance > threshold).
- After close: printable shift report.

---

## Inventory Pages

### 13. Product List

**Route:** `/{locale}/inventory/products`
**Audience:** Manager, Owner
**Layout:** Filters bar + table

- **Filters bar:** Search, Category dropdown, Branch dropdown, Stock status (In stock / Low / Out), Active/Archived toggle. Right side: "+ Add product" primary button, "Import" ghost button.
- **Table columns:** Image (thumb), Name (translatable), SKU, Category, Price, Stock (total across branches with badge color: green / amber / red), Status.
- Row hover: subtle background, full row clickable to detail.
- Bulk select via checkbox, with batch actions bar appearing on selection: "Edit prices", "Move category", "Archive", "Export selected".
- Empty state: illustration of stacked boxes, "No products yet", "Add your first product" CTA.

---

### 14. Product Detail

**Route:** `/{locale}/inventory/products/{id}`
**Audience:** Manager, Owner
**Layout:** Two-column — main content + side panel

- **Header:** Product image (large), name in display serif `text-h1`, SKU below muted, edit and archive icons in end-side.
- **Main column tabs:** Overview · Stock · Pricing · Variants · Suppliers · Activity
- **Overview tab:**
  - Description (translatable rich text)
  - Category, brand, unit, tax class chips
  - Barcodes list with QR preview
  - Image gallery
- **Stock tab:**
  - Per-branch table: Branch, On hand, Reserved, Available, Reorder point, Action (transfer / adjust).
  - Below: stock movements timeline (last 50, paginated).
- **Pricing tab:** Cost, base price, margin %, price history line chart.
- **Side panel (sticky):** Quick stats — total stock value, units sold (30d), velocity (units/day), days of cover.

---

### 15. Add / Edit Product

**Route:** `/{locale}/inventory/products/new` and `/{locale}/inventory/products/{id}/edit`
**Audience:** Manager, Owner
**Layout:** Single column form, sectioned

- Sections as cards with display-serif headers:
  - **Basics:** Name (en + ar tabs), Category, Image upload (multi)
  - **Identification:** SKU (auto-generate button), Barcodes (multi)
  - **Pricing:** Cost, Price, Tax class
  - **Inventory:** Track stock toggle, Initial stock per branch (table), Reorder points
  - **Variants** (collapsible): Add variant attribute (Color, Size, etc.)
- Sticky bottom bar: "Cancel" (ghost) and "Save" (accent).

---

### 16. Categories

**Route:** `/{locale}/inventory/categories`
**Audience:** Manager, Owner
**Layout:** Tree view + side detail panel

- Hierarchical tree on left, drag to reorder/reparent.
- Click category → right panel shows name (en + ar), parent, product count, "Edit" / "Delete".
- Top: "+ Add category" button.

---

### 17. Stock Levels (per-branch pivot)

**Route:** `/{locale}/inventory/stock`
**Audience:** Manager, Owner
**Layout:** Pivot table

- Rows: products (with search filter)
- Columns: branches
- Cells: stock quantity, color-coded by reorder status, hover shows "On hand / Reserved / Available".
- Top filters: Category, Branch (multi), Low-stock only toggle.
- Export button (CSV/XLSX).

---

### 18. Stock Movements Ledger

**Route:** `/{locale}/inventory/movements`
**Audience:** Manager, Owner, Auditor
**Layout:** Filterable table

- Filters: Date range, Product, Branch, Movement type (Sale / PO / Transfer / Adjust / Return / Writeoff), User
- Columns: Timestamp, Product, Branch, Type (chip with semantic color), Qty (signed, tabular), Reason, Reference (link to sale/PO), User
- Click row → side drawer with full movement details + linked entity preview
- Export button

---

### 19. Stock Transfers

**Route:** `/{locale}/inventory/transfers`
**Audience:** Manager
**Layout:** List + detail pattern

- **List page:** Tabs: Draft · In transit · Received · Cancelled. Table: ID, From branch, To branch, Items, Created, Status. "+ New transfer" button.
- **Transfer detail / new:**
  - Step 1: select from/to branches.
  - Step 2: add line items (scan or search), quantities.
  - Step 3: review and send.
  - States after sending: In transit → receiving branch confirms with scan, discrepancies flagged.

---

### 20. Stock Take / Cycle Count

**Route:** `/{locale}/inventory/stock-take`
**Audience:** Manager, Cashier (with permission)
**Layout:** Tablet-optimized scan flow

- **List:** Active counts, completed counts, "+ New count" button.
- **New count:** Choose branch, choose categories (or all), generate sheet.
- **Counting screen:** Large scan-focused input. Each scan increments a count. Side panel shows expected vs. counted with variance highlighting. Can switch to "list mode" to enter counts manually for non-scannable items.
- **Variance review:** Final screen lists every discrepancy with reason dropdowns, "Approve adjustments" button creates `cycle_count` movements.

---

## Branches Pages

### 21. Branch List

**Route:** `/{locale}/branches`
**Audience:** Owner
**Layout:** Grid of branch cards

- Each card: branch name in display serif, address, "Open" / "Closed" status pill, today's sales total, quick links (Stock, Staff, Edit).
- "+ Add branch" card at end.

---

### 22. Branch Detail / Edit

**Route:** `/{locale}/branches/{id}` and `/{locale}/branches/{id}/edit`
**Audience:** Owner, Manager (own branch)
**Layout:** Header + tabs

- Header: branch name display serif, address muted, status, "Edit" button.
- Tabs: Overview · Staff · Stock · Registers · Settings · Banking
- **Overview:** Sales today + comparisons, top products today, register status, recent activity.
- **Staff:** Assigned users with roles, "+ Assign user" button.
- **Stock:** Same view as global Stock Levels filtered to this branch.
- **Registers:** List of registers, current shift status, shift history.
- **Settings:** Hours, holidays, receipt language, default tax jurisdiction.
- **Banking:** Receiving bank accounts for this branch (or "uses tenant default").

---

### 23. Add Branch

**Route:** `/{locale}/branches/new`
**Audience:** Owner
**Layout:** Single-column wizard

Same fields as onboarding step 2, plus: currency override, timezone, opening date.

---

### 24. Branch Performance Dashboard

**Route:** `/{locale}/branches/{id}/dashboard`
**Audience:** Manager, Owner
**Layout:** Dashboard grid

- Hero number: today's revenue in display serif at 72px, vs. yesterday delta chip.
- 4-card row: Transactions, Avg basket, Items sold, Returns.
- Charts: Hourly sales line, Top categories donut.
- Leaderboard mini: this branch's rank vs. others (if multi-branch).
- Recent activity feed.

---

## Suppliers Pages

### 25. Supplier List

**Route:** `/{locale}/suppliers`
**Audience:** Owner, Manager
**Layout:** Filters + table

- Columns: Name, Country, Lead time, Currency, Open POs, Fill rate %, On-time %.
- Each row clickable.
- "+ Add supplier" primary.

---

### 26. Supplier Detail

**Route:** `/{locale}/suppliers/{id}`
**Audience:** Owner, Manager
**Layout:** Header + tabs

- Header: Supplier name display serif, primary contact, "Edit" button.
- **Scorecard card** at top: Fill rate (large number), On-time delivery, Avg lead time, Price-change frequency. Each with sparkline.
- Tabs: Overview · Catalog · Purchase Orders · Documents · Activity

---

### 27. Add / Edit Supplier

**Route:** `/{locale}/suppliers/new` and `/{locale}/suppliers/{id}/edit`
**Audience:** Owner, Manager
**Layout:** Sectioned form

- Sections: Basics (name, country, currency), Contacts (multi), Terms (payment terms, lead time), Banking (their bank for payments out), Tax ID.

---

### 28. Purchase Order List

**Route:** `/{locale}/suppliers/orders`
**Audience:** Owner, Manager
**Layout:** Filtered table

- Tabs: Draft · Sent · Confirmed · Partial · Received · Cancelled.
- Columns: PO number, Supplier, Branch, Created, Expected, Total, Status.
- "+ New PO" primary.

---

### 29. Purchase Order Detail / Create

**Route:** `/{locale}/suppliers/orders/{id}` and `/{locale}/suppliers/orders/new`
**Audience:** Owner, Manager
**Layout:** Two-column

- **Left/main:** Line items table — Product, Qty ordered, Qty received, Unit cost, Line total. Add line button. Totals at bottom.
- **Right/side:** Supplier card, branch, expected date, status timeline, notes, attachments.
- Top actions: Save Draft, Send to Supplier (emails PDF), Receive Goods, Cancel.

---

### 30. Goods Receipt

**Route:** `/{locale}/suppliers/orders/{id}/receive`
**Audience:** Manager
**Layout:** Scan-focused

- Header: PO summary.
- For each line: expected qty, actual qty input (scan to increment, or manual), discrepancy chip.
- Notes field.
- "Receive" button — creates stock movements, updates PO status.

---

## Sales & Customers Pages

### 31. Sales History

**Route:** `/{locale}/sales`
**Audience:** Owner, Manager, Cashier (own sales)
**Layout:** Filterable table

- Filters: Date range, Branch, Cashier, Payment method, Status (Paid / Pending / Disputed / Refunded).
- Columns: Receipt #, Date, Branch, Cashier, Customer, Items, Total, Payment, Status.
- Row click → sale detail.

---

### 32. Sale Detail

**Route:** `/{locale}/sales/{id}`
**Audience:** Manager, Owner
**Layout:** Receipt-like single column

- Receipt panel showing all lines, payments, totals (like printed receipt but on screen).
- Status banner if payment_pending or disputed.
- Actions: Print, Email, Refund (full/partial), View linked stock movements, View audit trail.

---

### 33. Refunds

**Route:** `/{locale}/sales/refunds`
**Audience:** Manager, Owner
**Layout:** Table

- Columns: Refund #, Original sale, Date, Amount, Reason, Processed by.
- Click → detail with reason history.

---

### 34. Customer List

**Route:** `/{locale}/customers`
**Audience:** Manager, Owner
**Layout:** Searchable table

- Columns: Name, Phone, Email, Visits, Lifetime value, Segment chip.
- "+ Add customer" + Import.

---

### 35. Customer Detail

**Route:** `/{locale}/customers/{id}`
**Audience:** Manager, Owner
**Layout:** Header + tabs

- Header: Avatar (monogram), name display serif, contact, segment chip.
- Stats row: Total spent, Visits, Avg basket, Last visit.
- Tabs: Purchase history · Notes · Store credit · Activity.

---

## Reports Pages

### 36. Reports Center

**Route:** `/{locale}/reports`
**Audience:** Owner, Accountant
**Layout:** Grid of report cards

- Card per report category: Sales · Profit & Loss · Inventory · Suppliers · Tax · Custom.
- Each card: title display serif, 1-sentence description, "Open" link.
- Top: "Scheduled reports" link to manage email schedules.

---

### 37. Sales Summary

**Route:** `/{locale}/reports/sales`
**Audience:** Owner, Manager
**Layout:** Filters + KPI cards + charts + table

- Date range picker + comparison toggle ("vs. previous period", "vs. same period last year").
- KPI cards row (4): Revenue, Transactions, Avg basket, Units sold. Each with delta chip.
- Charts row: Revenue over time (line), Revenue by branch (bar), Revenue by category (donut).
- Table: drilldown by day/branch/category, sortable.
- Export and Schedule buttons at top-end.

---

### 38. Profit & Loss

**Route:** `/{locale}/reports/pnl`
**Audience:** Owner, Accountant
**Layout:** Standard financial statement layout + drill

- Period selector top.
- Statement (display serif headings):
  - Revenue
  - Cost of goods sold (uses cogs_snapshot)
  - **Gross profit** (highlighted row, display serif amounts)
  - Operational adjustments (refunds, write-offs)
  - **Net profit before tax** (highlighted)
- Each line clickable → drill to underlying sales.

---

### 39. Top Movers / Margin Analysis

**Route:** `/{locale}/reports/movers`
**Audience:** Owner, Manager
**Layout:** Three lists side by side

- Three ranked lists with tabs: By revenue · By units · By profit (intentional — the rankings often differ).
- Each list: rank, product image+name, the relevant metric, sparkline.
- Below: Slow movers section (products with declining velocity).

---

### 40. Tax Report

**Route:** `/{locale}/reports/tax`
**Audience:** Accountant, Owner
**Layout:** Per-jurisdiction breakdown

- Date range.
- Per jurisdiction: taxable sales, tax collected, rate breakdowns.
- Export to PDF/CSV.

---

### 41. Trend Analysis

**Route:** `/{locale}/reports/trends`
**Audience:** Owner
**Layout:** Charts-heavy

- 7/30/90-day rolling averages, year-over-year overlay, seasonality indicators.
- Branch comparison option.

---

### 42. Custom Dashboard Builder

**Route:** `/{locale}/reports/dashboards/{id}`
**Audience:** Owner, Manager
**Layout:** Drag-and-drop grid

- Widget library side panel (collapsed): KPI, Line chart, Bar chart, Donut, Table, Goal tracker.
- Drag onto grid (12-column responsive).
- Each widget configurable via side panel: data source, filter, comparison, time range.
- Save / Share / Duplicate dashboard.

---

## Payment Verification (Tenant-side)

### 43. POS Payment Verification Queue

**Route:** `/{locale}/sales/verification`
**Audience:** Branch supervisor, Manager
**Layout:** Two-pane — list + detail

- **List:** Pending bank-transfer sales, oldest first. Filters: branch, date, amount.
- **Detail pane:** Receipt image (large, zoomable), expected amount, payer details, bank reference.
- Actions: Approve · Reject (with reason dropdown) · Request more info.
- Approve: sale → `paid`. Reject: sale → `disputed`, configurable follow-up.

---

### 44. Disputed Sales

**Route:** `/{locale}/sales/disputed`
**Audience:** Manager
**Layout:** Table with action column

- Columns: Sale, Date, Customer, Amount, Rejection reason, Days open.
- Actions: Resolve (mark paid manually with notes), Write off, Reopen for verification.

---

## Settings Pages

### 45. Profile / Account

**Route:** `/{locale}/settings/profile`
**Audience:** Any user
**Layout:** Single-column form

- Sections: Name + avatar, Email + change, Password + change, MFA setup, Language + locale preferences, Notifications opt-in.

---

### 46. Business Settings

**Route:** `/{locale}/settings/business`
**Audience:** Owner
**Layout:** Sectioned form

- Tenant name (translatable), legal name, tax ID, business type, primary currency, timezone, fiscal year, default tax-inclusive toggle.

---

### 47. Users & Roles

**Route:** `/{locale}/settings/users`
**Audience:** Owner
**Layout:** Two tabs — Users / Roles

- **Users tab:** Table — name, email, role, branches, status, last seen. Invite button.
- **Roles tab:** List of roles with permission counts. Click to edit permission matrix (rows: features, cols: read/write/delete checkboxes).

---

### 48. Branding

**Route:** `/{locale}/settings/branding`
**Audience:** Owner
**Layout:** Preview + form

- Logo upload, brand color override (within bounds — keeps Claude warmth), receipt header/footer text (translatable), QR code on receipts toggle.
- Live receipt preview on right.

---

### 49. Tax Classes & Rules

**Route:** `/{locale}/settings/taxes`
**Audience:** Owner, Accountant
**Layout:** List + detail

- List of tax classes (Standard, Reduced, Zero, Exempt) with rates per jurisdiction.
- Detail: rate %, inclusive/exclusive default, applies to (categories), effective dates.

---

### 50. Payment Methods

**Route:** `/{locale}/settings/payment-methods`
**Audience:** Owner
**Layout:** Toggleable list

- Each method (Cash, Bank Transfer, Manual Card, Store Credit) with enable toggle, display name (translatable), surcharge config, requires receipt toggle.

---

### 51. Bank Accounts (Receiving)

**Route:** `/{locale}/settings/bank-accounts`
**Audience:** Owner
**Layout:** Card list

- Each account: bank name (translatable), account holder, IBAN (masked except last 4), default toggle, per-branch overrides.
- "+ Add account" — opens form with all fields, bank logo auto-detection.

---

### 52. Notifications

**Route:** `/{locale}/settings/notifications`
**Audience:** Owner, Manager
**Layout:** Matrix

- Rows: Event types (low stock, large discount, refund, end-of-day variance, sync failure, payment verified).
- Columns: In-app, Email, SMS/WhatsApp.
- Checkboxes per cell.

---

### 53. Integrations

**Route:** `/{locale}/settings/integrations`
**Audience:** Owner
**Layout:** Grid of integration cards

- Each card: logo, name, status (Connected / Not connected), short description.
- Cards: QuickBooks, Xero, Google Sheets, WhatsApp (Twilio), Email SMTP.
- Click → connection wizard or settings panel.

---

### 54. Audit Log

**Route:** `/{locale}/settings/audit`
**Audience:** Auditor, Owner
**Layout:** Filterable read-only table

- Filters: date range, user, action type, entity type.
- Columns: timestamp, user, action, entity, before/after (expandable).
- Cannot be edited or deleted, banner notes this.

---

## Billing Pages (Tenant-side)

### 55. Subscription / Plan

**Route:** `/{locale}/billing/plan`
**Audience:** Owner
**Layout:** Current plan card + plan grid

- Current plan card: plan name display serif, status chip (Trial · Active · Grace · Suspended), next renewal date, current usage vs. limits.
- Plan comparison grid: 4 plans, current highlighted.
- "Upgrade" / "Change plan" actions.

---

### 56. Invoices List

**Route:** `/{locale}/billing/invoices`
**Audience:** Owner, Accountant
**Layout:** Table

- Columns: Invoice #, Date, Amount, Status (Draft / Awaiting transfer / Submitted / Paid / Overdue), Due date.
- Status filter chips at top.

---

### 57. Pay Invoice

**Route:** `/{locale}/billing/invoices/{id}/pay`
**Audience:** Owner
**Layout:** Single column, focused

- Invoice summary (amount, due date, plan).
- **Our bank accounts section** (the platform's accounts in tenant's currency): card per account with copy-to-clipboard for account number, reference code (highlighted, must include in transfer).
- Step indicator: "1. Make the transfer · 2. Upload receipt".
- Receipt upload zone (large, drag-or-tap).
- Fields: Payer name, Transfer date, Bank reference number.
- "Submit for verification" button.
- After submit: status page "Your payment is being verified. You'll be notified within 24 hours. You still have full access."

---

### 58. Billing History

**Route:** `/{locale}/billing/history`
**Audience:** Owner, Accountant
**Layout:** Timeline + receipts

- Chronological list of payment proofs and their states with mini-receipts and PDF downloads.

---

## System Pages

### 59. 404 Not Found

**Route:** any unmatched route
**Layout:** Centered card

- Big "404" in display serif at `text-display`.
- Heading: "We couldn't find that page"
- Body: "It may have moved, or the link may be wrong."
- Buttons: "Go to dashboard" (accent), "Go back" (ghost).

---

### 60. Offline Indicator

**Route:** Persistent component, not a page
**Audience:** All users during outages
**Layout:** Top banner

- Slim banner below top bar, `--color-warning-soft` background, warning icon: "You're offline. Sales will sync when reconnected." Click to expand sync details.
- POS continues to work; everything else shows cached data with disabled write actions.

---

### 61. Permission Denied

**Route:** `/{locale}/forbidden`
**Layout:** Centered card

- Lock icon, "You don't have access to that area", "Ask your administrator to grant permission." link.

---

# ADMIN APP — `apps/admin`

**Visual reminder:** Same design system, but the admin app uses `--color-admin-accent` (slate teal `#4A6B7A`) everywhere the tenant app uses warm coral. Header shows an "Admin Panel" badge. English-only.

## A0. Admin Global Shell

- Top bar (64px): platform logo + "Admin Panel" badge (slate teal pill), search across tenants, alerts bell, super-admin avatar.
- Sidebar with sections: Dashboard, Tenants, Billing, Banking, Team, Audit, System, Settings.
- Main content area same as tenant app but with the slate accent.
- **Impersonation banner** is the most prominent component anywhere on either app. When impersonating, full-width banner at very top: `--color-danger-soft` background, danger text, "You are viewing as [Tenant Name] · [Exit impersonation]". Banner never hides on scroll.

---

## Phase 1 Pages (MVP — 10 pages)

### A1. Admin Home

**Route:** `/`
**Layout:** Dashboard grid

- KPI strip across top (5 cards): MRR, Active tenants, Trials ending this week, Pending verifications, System health (green/amber/red dot).
- Two-column below:
  - Recent activity feed (signups, payments, suspensions) — chronological, last 50.
  - Verification queue snapshot — top 5 oldest pending, with quick approve button.
- Below: small charts — tenant growth (last 90 days), MRR trend.

---

### A2. All Tenants List

**Route:** `/tenants`
**Layout:** Filtered table

- Filters: Plan, Status (Trial / Active / Grace / Suspended / Cancelled), Country, Currency, Sign-up date range, Search.
- Columns: Name, Country, Plan, Status (chip), Branches, MRR, Last activity, Created.
- Bulk actions: Send announcement, Export.
- Row click → Tenant detail.

---

### A3. Tenant Detail

**Route:** `/tenants/{id}`
**Layout:** Header + tabs

- **Header:** Tenant name display serif `text-h1`, country flag, plan chip, status chip, signed-up date.
- **Action buttons end-side:** "Log in as" (danger-soft variant — emphasizes audit), "Send message", "Manage plan", ⋯ menu (Suspend, Export data, Delete).
- **Tabs:** Overview · Branches · Users · Billing · Activity · Notes
- **Overview tab:**
  - Stats row: Total revenue (their POS), Transactions all-time, Branches, Users.
  - Usage vs plan: progress bars for transactions/mo, storage, branches, users.
  - Recent invoices.
  - Recent activity.
- **Branches tab:** List of their branches.
- **Users tab:** List of their users with last-seen.
- **Billing tab:** Subscription status, invoices, payment proofs, plan history.
- **Activity tab:** Audit log filtered to this tenant (cross-tenant view possible only to platform owner role).
- **Notes tab:** Internal support notes (visible only to super-admins).

---

### A4. Subscription Verification Queue

**Route:** `/billing/verification`
**Layout:** Two-pane — list + detail (largest page in the admin app, optimized for verifier productivity)

- **Left pane (list):**
  - Filters: amount range, currency, days pending, tenant.
  - Sort: oldest first by default.
  - Each row: Tenant name, amount (display serif, tabular), days pending (color-coded), submitted date.
- **Right pane (detail) — opens on row click:**
  - Receipt image viewer — large, zoom, rotate, fullscreen.
  - Beside it: expected amount (display serif), tenant submitted details (payer name, transfer date, bank reference), our bank account that should have received it.
  - Match status indicators: ✓ Amount matches, ✓ Date plausible, ⚠ Reference missing, etc.
  - **Action bar fixed at bottom:**
    - "Approve" (success color, primary action)
    - "Reject" (danger ghost) — opens reason picker modal: Wrong amount / Unreadable receipt / Wrong account / Duplicate / Other (with text)
    - "Request more info" (ghost) — sends message to tenant
    - Notes field (visible after action, for audit)
- Keyboard shortcuts: J/K to navigate list, A to approve, R to reject.

---

### A5. Payment Proof Detail (full-page view)

**Route:** `/billing/verification/{proofId}`
**Layout:** Same as right pane above but full-page (for sharing links)

- Includes complete audit trail of the proof: submitted → (any previous rejections) → current state.

---

### A6. All Invoices

**Route:** `/billing/invoices`
**Layout:** Filtered table

- Filters: status, currency, date range, tenant, overdue toggle.
- Columns: Invoice #, Tenant, Amount, Currency, Issued, Due, Status, Days overdue.

---

### A7. Platform Bank Accounts

**Route:** `/banking/accounts`
**Layout:** Card list

- Each account card: Bank name, country flag, currency, account holder, IBAN (masked, reveal button with confirm), default-for-currency toggle.
- "+ Add account" button.
- Each card has "Edit" and "Disable" actions.
- Disabled accounts grayed out, kept for historical references.

---

### A8. Super-Admin Team

**Route:** `/team`
**Layout:** Two tabs — Members / Roles

- **Members tab:** Table — name, email, role, MFA status (green/red dot), last login, status.
- "+ Invite member" button — opens invite form with role picker.
- **Roles tab:** List of roles (Platform Owner, Finance, Support, Developer, Read-only) with permission matrix. Permission matrix editable only by Platform Owner.

---

### A9. Login-as Audit Log

**Route:** `/audit/login-as`
**Layout:** Filterable table

- Columns: Timestamp, Super-admin, Tenant, Duration, Actions taken (count), IP, User agent.
- Click row → expanded view of every action taken during that impersonation session (linked from `audit_log` via `impersonator_id`).

---

### A10. Platform Audit Log

**Route:** `/audit/platform`
**Layout:** Read-only filterable table

- Filters: Super-admin, Action type, Date range, Target tenant.
- Columns: Timestamp, Super-admin, Action, Target, IP.
- Cannot be edited or deleted. Banner confirms this.

---

## Phase 2 Pages (10 pages — listed briefly)

- **A11. Support Tickets List** — Tabs: Open / Pending / Resolved. Standard ticket table.
- **A12. Ticket Detail** — Thread, internal notes pane, tenant link, status controls.
- **A13. Email Templates** — Editable list, bilingual (en + ar), variables panel, preview.
- **A14. Feature Flags** — Flag list with per-flag rollout (Global / Specific tenants / Percentage).
- **A15. System Health** — Service status grid (API, DB, Redis, S3, ClamAV), latency charts, error rate.
- **A16. Background Jobs Monitor** — BullMQ dashboard embedded.
- **A17. Bank Statement Import** — CSV upload + fuzzy match table + manual link.
- **A18. Aging Report** — Pending payment proofs by age buckets (0-3d / 4-7d / 8-14d / 15+d).
- **A19. Tenant Lifecycle Manager** — Find tenants by status, bulk transition with reason.
- **A20. Security Events** — Failed logins, suspicious activity, IP anomalies.

---

## Phase 3 Pages (10 pages — listed briefly)

- **A21. MRR Dashboard** — MRR/ARR breakdown, expansion/contraction/churn waterfall.
- **A22. Cohort Retention** — Standard cohort grid by signup month.
- **A23. Churn Analysis** — Reasons, by-plan, by-country.
- **A24. Geographic Distribution** — Map view + table.
- **A25. In-App Announcements** — Composer for targeted banners with audience picker.
- **A26. Communication Log** — All emails/messages sent per tenant.
- **A27. Support Macros** — Canned response editor.
- **A28. Usage & Limits Overview** — Tenants nearing plan caps.
- **A29. Tenant Data Export** — GDPR / cancellation export trigger.
- **A30. Tenant Deletion** — Hard-delete flow with typed confirmation and 30-day soft delete.

---

## Phase 4 Pages (15 pages — listed briefly)

- **A31. Plans List** — Edit plans, features, limits.
- **A32. Plan Editor** — Detailed plan form.
- **A33. Discount Codes** — Create promo codes.
- **A34. Webhook Delivery Log** — Outbound webhooks with retry status.
- **A35. Outbound Email Log** — All system emails.
- **A36. Bank Reconciliation Tool** — Advanced matching with rules engine.
- **A37. Roles & Permissions Editor** — Granular permission matrix.
- **A38. Compliance Report** — Data residency, GDPR access requests.
- **A39. Global Audit Log** — Read-only across all tenants.
- **A40. Platform Settings** — Default locale, supported currencies, brand assets.
- **A41. Notification Routing** — Who gets alerted for what (super-admin side).
- **A42. API Keys & Integrations** — Resend, ClamAV, S3 keys management.
- **A43. Translation Overrides** — Per-tenant text customizations.
- **A44. Activity Feed (expanded)** — Full-page version of dashboard widget.
- **A45. Impersonation Review** — Flagged login-as sessions queued for review.

---

# Cross-App Design Rules Summary

| Concern | Tenant App | Admin App |
|---|---|---|
| Primary accent | `--color-accent` (warm coral `#C96442`) | `--color-admin-accent` (slate teal `#4A6B7A`) |
| Languages | English + Arabic (full RTL) | English only |
| Hero typography | Fraunces display serif | Same |
| Body typography | Geist sans | Same |
| Arabic body | IBM Plex Sans Arabic | N/A |
| Audit log | Per-tenant `audit_log` | `platform_audit_log` |
| Dark mode | Yes, day one | Yes, day one |
| Mobile | PWA, full mobile support | Desktop-first, mobile-readable |
| Domain | `app.yourpos.com` | `admin.yourpos.com` |
| MFA | Optional, encouraged for owners | Mandatory for all |

---

# Empty State Patterns (Required Everywhere)

Every list, table, or data view has a designed empty state. Pattern:

1. **Quiet illustration or oversized Lucide icon** in `--color-ink-subtle`.
2. **Headline** in display serif at `text-h3`: explains *what's missing*.
3. **Body** in `text-body` muted: explains *why this might be* (one sentence).
4. **One CTA** in primary accent — the most obvious next action.

Example for product list empty state:
```
[Box icon, 64px, ink-subtle]
"No products yet"
"Add your first product to start selling."
[Button: + Add product]
```

---

# Loading State Patterns

- **Page-level loading:** skeleton screens matching the page layout. No spinners.
- **Inline loading:** small spinner (Lucide loader, animated), accent color, 16px.
- **Button loading:** button keeps its size, content swaps to spinner + label ("Saving…"), button disabled.
- **Table loading:** show 5 skeleton rows.
- **Image loading:** soft gray block with `--color-surface-sunk`, no spinner.

---

# Error State Patterns

- **Field error:** inline below field, `--color-danger` text, `text-small`, with icon.
- **Form error:** banner at top of form, `--color-danger-soft` background.
- **Section error:** card with danger icon, "Couldn't load [thing]", "Try again" button.
- **Full-page error:** centered card like 404, with helpful actions.
- **Toast error:** appears bottom-end, dismissible, 4s auto-hide.

---

# Print Stylesheets

Pages that need print support (receipts, POs, invoices, reports):

- Print CSS resets the warm bg to pure white, removes shadows, ensures text contrast.
- Display serif retained for headings, monospaced numerals.
- Thermal receipt CSS targets 58mm and 80mm widths with appropriate font sizes.
- Test print preview in both languages — Arabic shaping must render correctly.

---

# Build Order for Pages

Don't build all pages at once. Build the **page shells first** (routing, layout, navigation), then fill in content phase by phase per `CLAUDE.md` build sequence.

**Phase 1 priority order:**
1. Global shell + nav (both apps)
2. Auth pages (login, signup, reset)
3. Onboarding wizard
4. POS sell screen + payment + receipt
5. Product CRUD + categories
6. Stock levels + movements
7. Sales history + detail
8. Basic reports (sales summary)
9. Settings essentials (profile, business, users, bank accounts)
10. Billing pages (plan, invoices, pay)
11. Payment verification queue (tenant side)
12. Admin app MVP (10 pages)

Everything else waits.

---

# Reference

- **CLAUDE.md** — design tokens, components, conventions
- **PRD.md** — product scope and user stories
- **docs/design-system.md** — visual component gallery (build alongside the design system package)

When the design system and this document disagree, the **design system wins**. This document describes *how* to compose tokens into pages; the tokens themselves are authoritative.
</pasted_text>


<system-reminder>Auto-injected reminder (ignore if not relevant): do not recreate copyrighted or branded UI unless the user's email domain matches that company. Create original designs instead.</system-reminder>

## Assistant

_[tool: list_files]_

_[tool: read_file]_

You've shared a detailed PAGES.md spec for Madar — but I notice you haven't asked me to do anything specific yet. The project already has a Madar.html scaffold with screens for dashboard, checkout, inventory, suppliers/branches, analysis, and extras.

A note on the spec: it references "Claude-inspired" design language and `useTranslations()`. I'll create an original aesthetic for Madar (warm paper, editorial serif, terracotta accent — which can stand on its own as a POS brand identity), rather than evoking another company's product. The visual system you've already started in this project does exactly that.

**What would you like me to do?** A few likely directions:

1. **Audit the current Madar.html** against the spec — list which of the 60+ tenant pages and 10 MVP admin pages are covered, and what's missing.
2. **Build out missing Phase 1 pages** — e.g. the auth flow (signup/login/reset), onboarding wizard, payment verification queue, billing/pay-invoice flow, or the admin app shell + verification queue.
3. **Refine specific existing screens** to match the spec more tightly (e.g. POS sell screen — the spec is very prescriptive about the 60/40 split, 64px Pay button, display-serif totals, etc.).
4. **Add the admin app** as a separate file (`Madar Admin.html`) with the slate-teal accent and the 10 MVP pages.
5. **Something else** — a design canvas comparing layout variations for one screen, a deck pitching the system, etc.

Which of these (or something else)? If you want me to just pick a high-value direction, I'd suggest **#2 focused on the Payment Verification Queue + Pay Invoice flow** — those are the load-bearing differentiators in this spec (the manual bank-transfer reconciliation loop) and they're not in the current build.

## User

ok build 2 then ask me what next

## Assistant

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: grep]_

_[tool: grep]_

_[tool: update_todos]_

_[tool: read_file]_

Got it. I'll build the Billing flow (pages 55–58) as a dedicated screen — it's the most distinctive missing piece, with the Pay Invoice bank-transfer flow being the load-bearing differentiator. I'll also add Auth pages (login, signup, forgot password, verify) on a separate page.

_[tool: write_file]_

Now I'll build the Billing screen with the Pay Invoice flow as the centerpiece.Now wire it into the app:

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: update_todos]_

_[tool: write_file]_

Now the Auth file — Landing, Signup, Login, Forgot, Verify, all in one navigable file:

_[tool: show_html]_

_[tool: done]_

_[tool: fork_verifier_agent]_

_[tool: update_todos]_

Built two new pieces of Phase 1:

**`Madar.html` → Billing** (new sidebar item under Money)
- **Plan & usage**: current plan card with usage progress bars (txns / users / branches / storage), next-invoice card, billing contact, and a 4-plan comparison strip
- **Invoices**: filtered table (All / Awaiting / In review / Paid) with status chips and per-row actions
- **Pay Invoice sheet** (the load-bearing flow): step 1 picks one of three platform bank accounts (CIB, NBE, Emirates NBD) with copy-to-clipboard for IBAN/SWIFT and a highlighted reference code; step 2 is receipt drop-zone + payer name / date / bank ref; submit → "Being verified" state with animated waiting dot. Re-opening an already-submitted invoice shows a verification timeline instead.
- **Payment history**: timeline of submitted / verified events with lifetime spend + avg verification time stats

**`Madar Auth.html`** (separate file, view-switcher pill in bottom-right)
- **Landing**: hero with kicker pill + italic-accent headline + product peek cards offset to the side, three numbered editorial feature sections, 3-card pricing teaser, final CTA, minimal footer
- **Sign up / Login / Forgot / Reset / Verify Email** — shared two-column shell (warm editorial rail + form card), with working state transitions: login → MFA 6-box code, forgot → "check your email" state, verify email → success + expired variants. SSO row, password strength bars, all keyboard-friendly.

---

**What next?** A few directions ranked by what I think is highest leverage:

1. **Admin app** (`Madar Admin.html`) — separate app with slate-teal accent, Impersonation banner, and the 10 MVP pages. The **Subscription Verification Queue** (A4) is the most distinctive — two-pane list+detail with receipt viewer, match indicators, J/K/A/R shortcuts.
2. **Onboarding wizard polish** — the current one is functional; the spec wants a focused 3-step flow (Business → Branch → Products) with auto-save and the "Skip for now" branch. Could rebuild as a dedicated route rather than a modal.
3. **POS sell screen tightening** — the existing Checkout doesn't quite match the spec's prescriptive 60/40 split, 64px Pay button, display-serif total at 56–72px, held-sales tray. Could do a careful pass.
4. **Receipt artifacts** — printable 58mm / 80mm receipts, bilingual, with the bank-transfer "pending verification" badge. Useful for the print stylesheet section.
5. **A design canvas comparing layouts** for one of the screens — e.g. three variants of the Pay Invoice flow, or three landing-page directions.

My pick: **#1 (Admin app + Verification Queue)** — it's the natural counterpart to the Billing flow I just built (the tenant submits → admin verifies). Together they tell the full manual-bank-transfer story, which is the spec's main differentiator.

Which way?

## User

ok 1

## Assistant

_[tool: update_todos]_

_[tool: write_file]_

_[tool: write_file]_

Now the admin shell + app file:Now the centerpiece — the Verification Queue + Proof Detail:

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: done]_

_[tool: fork_verifier_agent]_

_[tool: update_todos]_

**`Madar Admin.html` — Phase 1 MVP, 10 pages, slate-teal accent.**

- **Dashboard (A1)** — 5-card KPI strip (MRR, active tenants, trials ending, pending verifications, system health), top-5 verification snapshot with one-tap approve, recent activity feed, growth + MRR sparkline charts.
- **All Tenants (A2)** — filterable table by status/country, search, status chips, row → tenant detail.
- **Tenant Detail (A3)** — 64px gradient monogram header, status chips, tabs (Overview / Branches / Users / Billing / Activity / Notes). Overview has plan-utilization bars and recent invoices. **"Log in as" button** is danger-styled and opens a confirmation modal with required reason field.
- **Verification Queue (A4)** — the centerpiece. 340px list pane (oldest first, color-coded by age, mismatch flags) + detail pane with synthetic bank-receipt mock that zooms/rotates, four match-indicator pills (amount/date/reference/account), tenant context stats, history. Fixed action bar at the bottom with **Approve (green) / Reject (rose) / Request info** buttons. **Keyboard shortcuts wired: J/K navigate, A approve, R reject, E request info** — with a hint pill showing this up top. Approved/rejected receipts disappear with a toast and auto-advance to the next.
- **Payment Proof Detail (A5)** — full-page version of the right pane with shareable URL preview, opened via the eye icon.
- **All Invoices (A6)** — cross-tenant table with filter chips (All / In review / Paid / Overdue), days-overdue column color-coded.
- **Bank Accounts (A7)** — card grid for 5 platform accounts (CIB, NBE, Emirates NBD, Al Rajhi, Banque Misr — disabled). IBAN masked by default with reveal button, default-per-currency toggle, this-month volume.
- **Team & Roles (A8)** — Members tab with MFA dots (red if missing), Platform Owner chip in rose; Roles tab with 5 roles + permission summary.
- **Login-as Audit (A9)** — every impersonation session, expandable rows that show every action taken during that session with timestamps.
- **Platform Audit (A10)** — append-only banner, action codes as `code` chips, IP per entry.

**Impersonation banner**: when you click "Log in as" on a tenant, a full-width rose gradient banner pins to the top above everything else with an "Exit impersonation" button — exactly as the spec requires.

To exercise the impersonation flow: open any tenant → "Log in as" → enter reason → Start. The banner shows up over every screen until you exit.

---

**What next?** A few possible directions:

1. **Onboarding wizard rebuild** — the current one is a modal in the tenant app; the spec wants a focused 3-step route (Business → Branch → Products) with auto-save and skip paths. Could rebuild as a standalone page that feels like a first-day-in-the-shop experience.
2. **POS sell screen tightening** — match the spec's 60/40 split, 64px Pay button, display-serif 56–72px total, held-sales tray. The current checkout is functional but doesn't quite hit those proportions.
3. **Printable artifacts** — 58mm / 80mm thermal receipts (bilingual, with bank-transfer "pending" badge), printable invoice PDF, end-of-day shift report. These tie up the print stylesheet section of the spec.
4. **Polish pass** — paper textures, dark-mode review across new screens, RTL pass on Billing + Auth, animation/transition tightening.
5. **A design canvas comparing variants** of one screen — e.g. three Verification Queue layouts, or three landing pages for the auth file.

My pick: **#2 (POS sell screen)** — it's described as "the most important screen in the product" in the spec and the current one underdelivers on the typography hierarchy. A focused pass would have outsized visual impact.

Which way?

## User

Verifier agent check completed

## Assistant

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: done]_

Fixed both:

1. **Topbar crumb on Tenant Detail** — added the `tenant_detail` route to the crumbs map, with the tenant's name as the sub-crumb so it reads "Tenant · Bayt Coffee Co."
2. **Verification action bar clip** — shortened the green primary button to **"Approve"** (the `A` kbd hint carries the verb), and let the footer `flex-wrap` on narrower viewports as a defensive fallback.

Ready for the next direction whenever you are — my standing recommendation is **#2 (POS sell screen tightening)**.

## User

ok

## Assistant

_[tool: read_file]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

Looking at the existing checkout vs the spec, key gaps: no slim 48px header replacing topbar, total isn't 56–72px display serif, Pay button isn't 64px, no held-sales tray, no pressed-scale on tiles, search isn't 56px with autofocus, price on tile too small. Let me rebuild cleanly.Now rewrite the checkout to match the spec:

_[tool: write_file]_

_[tool: grep]_

All needed icons exist. Let me verify the build.

_[tool: done]_

_[tool: fork_verifier_agent]_

Rebuilt the POS Checkout screen to match the spec's prescriptive requirements:

- **No standard topbar** — added `data-pos` attribute on `.app` that hides the regular topbar in POS mode. Checkout brings its own slim **48px header** with shift dot, branch / cashier / shift number on the left, and **Held pill** (with count badge), live clock, today's totals + End shift button on the right.
- **60 / 40 split** — products left, cart right with `--paper` background distinction.
- **56px tall search bar** in serif at 19px, autofocus on mount, accent ring on focus, ESC clears.
- **Category pills** below search as separate row, --radius-full with active state in accent and per-cat count badge.
- **Product tiles** — auto-fill 150px min, square gradient swatch with serif monogram, two-line name, **price in display serif at 22px**, no clutter icons. Pressed state at scale(0.97), terracotta border on press.
- **Cart**: "Cart" header in display serif 28px, Clear + Hold links. Customer attach row (tap to attach a mock customer). Lines show qty stepper, name, sub-info, **line total in display serif 20px**.
- **Tap a line → bottom sheet** with number pad, discount chips (0/5/10/15/20%), kitchen note, remove option.
- **Subtotal / VAT / Discount** stack with discount in accent (collapsed unless non-zero).
- **Hero total**: display serif at **56px** with kicker "Total · EGP" and small currency symbol.
- **Pay button**: full width, **64px tall**, terracotta, serif "Pay" + serif amount, with accent-tinted shadow.
- **Empty cart**: hand-drawn basket SVG, "Scan or tap a product to start" headline in serif 19px, helper text with `Esc` kbd hint.
- **Held sales tray** opens as a modal with parked tickets — each row has Resume + discard. Holding the current cart parks it and resets to empty.
- **Cash payment** flow now has quick-tap denominations (Exact / ↑50 / ↑100 / £200 / £500) and a change-due card in sage when overpaid.

Ready for the next direction whenever you are.

## User

done all them at one

## Assistant

_[tool: update_todos]_

Got it — going wide. I'll build all four in one pass: print artifacts, onboarding standalone, design canvas with landing variants, and a polish review at the end.

_[tool: write_file]_

