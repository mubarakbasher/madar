# 0002 — Bank Transfer with Manual Verification over Payment Gateway

**Status:** Adopted
**Date:** May 2026
**Deciders:** Product Owner

## Context

Both subscription billing (tenants paying us) and in-store POS payments (customers paying tenants) need a payment mechanism. The conventional choice is a payment gateway (Stripe, Paymob, Tap, PayTabs).

Our target markets include regions where card processing is unreliable, expensive, or absent. Many SMB customers prefer or require bank transfer for high-value transactions. We also have no existing relationship with any payment processor.

## Decision

We will **not integrate a payment gateway** in v1. Both flows will use:
1. Bank transfer initiated by the payer at their bank, off-platform.
2. Receipt upload (image of the bank's transaction confirmation).
3. Manual verification by a human operator (super-admin for subscriptions, branch supervisor for sales).

We will build a single shared `payment-proof` module that powers both flows, with context-specific UI for the verifier.

## Consequences

### Positive

- **Regional flexibility.** Works in any country with a banking system. Not blocked by gateway availability.
- **No PCI scope.** We never touch card data. Compliance burden is significantly lower.
- **No processor fees.** 0% transaction cost (vs. 2.5–4% for typical gateways).
- **No chargeback risk.** Bank transfers are not reversible by customer dispute (only by bank fraud investigation).
- **Customer trust.** Many SMB customers prefer bank transfer; it feels safer than entering card details.
- **Operational simplicity.** No webhooks from a processor, no API rate limits, no service degradations from a third party.

### Negative

- **Manual operations cost.** Verifying receipts takes operator time. At scale, this becomes a real expense.
- **Verification latency.** Tenants and customers wait up to 24 hours for verification instead of seconds.
- **Slower trial-to-paid conversion.** Friction between "decide to pay" and "service unblocked."
- **Receipt fraud risk.** A fake bank screenshot could deceive a verifier. Mitigated by bank statement reconciliation (Phase 2) and audit trail.
- **No recurring auto-charge.** Tenants must manually pay each renewal. Mitigated by 7-day reminder cadence and grace period.

### Mitigations Built In

- **Keyboard-driven verifier UI** with J/K navigation and one-key approve/reject.
- **Bank statement import and fuzzy matching** in Phase 2 — verifier reconciles in bulk.
- **Aging report** to ensure no proof sits unverified.
- **Daily digest** to verifiers showing queue depth.
- **Inventory commits regardless of verification status** on POS sales — the goods left the shop, so stock is decremented immediately. Disputed payments become an A/R problem, not a stock problem.

## Alternatives Considered

### Stripe + bank transfer fallback

Rejected. Doubles integration complexity, introduces gateway dependency without removing the manual flow. We'd carry the worst of both worlds.

### Paymob / Tap / PayTabs (regional gateways)

Rejected for v1. Region-specific gateways tie us to one geography. Onboarding cost is high. Fees still apply. We can revisit if a specific market needs faster payment.

### Bank API integration (Open Banking)

Rejected. Open Banking is fragmented across our target markets. No single API standard. Bank-by-bank integration is months of work each. Reconsider in Phase 4+.

### "Pay later" / postpaid model

Rejected for subscriptions. We'd carry the receivables risk without the operational structure to collect.

## Future Reconsideration

Re-evaluate this decision if:
- The verification queue exceeds 2 hours per day of operator time consistently.
- We expand into a market where bank transfer is genuinely impractical (Western markets).
- A specific enterprise customer demands card billing as a contract term.

## References

- `billing-flow.md` — full payment flow specifications
- `PRD.md` section 4.8 — payments and billing
- `admin-app.md` section 7.1 — verification queue UI
