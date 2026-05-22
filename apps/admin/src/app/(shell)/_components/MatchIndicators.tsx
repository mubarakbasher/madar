import { Check, X, Minus } from "lucide-react";
import type { ProofItem } from "@/lib/api/admin-proofs";

type Tone = "ok" | "bad" | "neutral";

interface Pill {
  label: string;
  value: string;
  tone: Tone;
}

function compute(proof: ProofItem): Pill[] {
  const now = Date.now();
  const transferMs = new Date(proof.transfer_date).getTime();
  const ageDays = (now - transferMs) / 86_400_000;
  const dateOk = !isNaN(ageDays) && ageDays >= 0 && ageDays <= 14;

  const referenceOk = !!proof.transfer_reference && proof.transfer_reference.trim().length > 0;

  const expectedKind = proof.context === "subscription" ? "platform" : "tenant";
  const accountOk = proof.bank_account_kind === expectedKind;

  return [
    // Amount needs the linked invoice/sale to compare against — defer to a
    // server-computed match flag in a later slice. Show as neutral for now.
    { label: "Amount", value: formatMoney(proof.amount_cents, proof.currency_code), tone: "neutral" },
    {
      label: "Date",
      value: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
        transferMs ? new Date(transferMs) : new Date(),
      ),
      tone: dateOk ? "ok" : "bad",
    },
    {
      label: "Reference",
      value: referenceOk ? (proof.transfer_reference as string) : "missing",
      tone: referenceOk ? "ok" : "bad",
    },
    {
      label: "Account",
      value: proof.bank_account_kind === "platform" ? "Platform" : "Tenant",
      tone: accountOk ? "ok" : "bad",
    },
  ];
}

function formatMoney(cents: string, currency: string): string {
  const major = Number(BigInt(cents)) / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 2,
    }).format(major);
  } catch {
    return `${major.toFixed(2)} ${currency}`;
  }
}

export function MatchIndicators({ proof }: { proof: ProofItem }) {
  const pills = compute(proof);
  return (
    <div className="admin-match-row" role="list" aria-label="Verification match indicators">
      {pills.map((p) => (
        <span
          key={p.label}
          role="listitem"
          className={`admin-match-pill admin-match-pill--${p.tone}`}
        >
          {p.tone === "ok" && <Check size={11} strokeWidth={2} />}
          {p.tone === "bad" && <X size={11} strokeWidth={2} />}
          {p.tone === "neutral" && <Minus size={11} strokeWidth={2} />}
          <span className="admin-match-pill-label">{p.label}</span>
          <span className="admin-match-pill-value">{p.value}</span>
        </span>
      ))}
    </div>
  );
}
