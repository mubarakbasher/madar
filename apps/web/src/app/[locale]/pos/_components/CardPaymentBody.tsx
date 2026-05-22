"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CreditCard } from "lucide-react";

const MIN_LEN = 4;
const MAX_LEN = 20;

export function CardPaymentBody({
  onSubmit,
  submitting,
}: {
  onSubmit: (approval_code: string) => void | Promise<void>;
  submitting: boolean;
}) {
  const t = useTranslations("pos.payment.card");
  const [approvalCode, setApprovalCode] = useState("");

  const trimmed = approvalCode.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < MIN_LEN;
  const canSubmit = trimmed.length >= MIN_LEN && trimmed.length <= MAX_LEN && !submitting;

  function handleClick() {
    if (!canSubmit) return;
    void onSubmit(trimmed);
  }

  return (
    <div>
      <div className="kicker" style={{ marginBottom: 6 }}>
        {t("approvalCodeLabel")}
      </div>
      <input
        value={approvalCode}
        onChange={(e) => setApprovalCode(e.target.value.toUpperCase())}
        placeholder={t("approvalCodePlaceholder")}
        className="pos-input tnum"
        inputMode="text"
        minLength={MIN_LEN}
        maxLength={MAX_LEN}
        autoComplete="off"
        aria-label={t("approvalCodeLabel")}
      />
      {tooShort && (
        <div
          role="alert"
          style={{
            marginTop: 6,
            fontSize: 12,
            color: "var(--rose)",
            fontFamily: "var(--sans)",
          }}
        >
          {t("errors.length")}
        </div>
      )}

      <div
        style={{
          background: "var(--bg-sunk)",
          border: "1px solid var(--rule)",
          borderRadius: 10,
          padding: 12,
          marginTop: 12,
          display: "flex",
          gap: 10,
          fontSize: 12,
          color: "var(--ink-2)",
        }}
      >
        <CreditCard size={14} strokeWidth={1.5} style={{ flexShrink: 0, marginTop: 2 }} />
        <div>{t("terminalHint")}</div>
      </div>

      <button
        type="button"
        className="pos-btn pos-btn-primary"
        disabled={!canSubmit}
        onClick={handleClick}
        style={{ marginTop: 16, width: "100%", justifyContent: "center" }}
      >
        {submitting ? "…" : t("submit")}
      </button>
    </div>
  );
}
