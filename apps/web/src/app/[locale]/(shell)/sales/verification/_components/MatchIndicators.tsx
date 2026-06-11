"use client";
import { Check, X, Minus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ProofItem } from "@/lib/api/payment-proofs";
import { formatMoney as formatMoneyShared, minorToMajor } from "@/lib/currency";

type Tone = "ok" | "bad" | "neutral";

function formatMoney(cents: string, currency: string): string {
  try {
    return formatMoneyShared(cents, currency || "USD");
  } catch {
    return `${minorToMajor(cents, currency || "USD")} ${currency}`;
  }
}

export function MatchIndicators({ proof }: { proof: ProofItem }) {
  const t = useTranslations("verification.match");

  const now = Date.now();
  const transferMs = new Date(proof.transfer_date).getTime();
  const ageDays = (now - transferMs) / 86_400_000;
  const dateOk = !isNaN(ageDays) && ageDays >= 0 && ageDays <= 14;

  const referenceOk = !!proof.transfer_reference && proof.transfer_reference.trim().length > 0;

  // Sale-context proofs should target a tenant bank; subscription a platform bank.
  const expectedKind = proof.context === "subscription" ? "platform" : "tenant";
  const accountOk = proof.bank_account_kind === expectedKind;

  const pills: Array<{ label: string; value: string; tone: Tone }> = [
    { label: t("amount"), value: formatMoney(proof.amount_cents, proof.currency_code), tone: "neutral" },
    {
      label: t("date"),
      value: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
        transferMs ? new Date(transferMs) : new Date(),
      ),
      tone: dateOk ? "ok" : "bad",
    },
    {
      label: t("reference"),
      value: referenceOk ? (proof.transfer_reference as string) : t("missing"),
      tone: referenceOk ? "ok" : "bad",
    },
    {
      label: t("account"),
      value: proof.bank_account_kind === "platform" ? t("accountPlatform") : t("accountTenant"),
      tone: accountOk ? "ok" : "bad",
    },
  ];

  return (
    <div className="vq-match-row" role="list">
      {pills.map((p) => (
        <span key={p.label} role="listitem" className={`vq-match-pill vq-match-pill--${p.tone}`}>
          {p.tone === "ok" && <Check size={11} strokeWidth={2} />}
          {p.tone === "bad" && <X size={11} strokeWidth={2} />}
          {p.tone === "neutral" && <Minus size={11} strokeWidth={2} />}
          <span className="vq-match-pill-label">{p.label}</span>
          <span className="vq-match-pill-value">{p.value}</span>
        </span>
      ))}
    </div>
  );
}
