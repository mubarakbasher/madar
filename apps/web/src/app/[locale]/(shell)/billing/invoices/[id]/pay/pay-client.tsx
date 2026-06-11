"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ArrowLeft, Check, Copy, FileUp, Loader2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Link, useRouter } from "../../../../../../../../i18n/routing";
import {
  invoiceGetRequest,
  platformBankAccountsRequest,
  submitSubscriptionProof,
  type ApiPlatformBankAccount,
} from "@/lib/api/billing";
import { useAuthStore } from "@/lib/auth/store";
import { ApiError } from "@/lib/api/client";
import { currencyMinorUnits, formatMoney, minorToMajor } from "@/lib/currency";

type Step = 1 | 2 | 3;

function formatCents(cents: string, currency: string): string {
  return formatMoney(cents, currency || "USD", "en");
}

/**
 * Plain-text QR payload the customer can scan into their notes / banking app.
 * We intentionally do NOT emit a full IBAN — platform bank accounts store the
 * account number AES-encrypted and the API only exposes the last-4 mask (see
 * docs/billing-flow.md §4.5). The reference code + amount are the
 * error-prone bits that scanning makes safe; the IBAN itself is on the screen
 * for the customer to type or look up from their existing tenant agreement.
 */
function buildPaymentQrPayload(input: {
  bank: ApiPlatformBankAccount;
  amountCents: string;
  currency: string;
  reference: string;
}): string {
  const major = minorToMajor(input.amountCents, input.currency).toFixed(
    currencyMinorUnits(input.currency),
  );
  const lines = [
    `Bank: ${input.bank.bank_name}`,
    `Account holder: ${input.bank.account_holder}`,
  ];
  if (input.bank.iban_last4) lines.push(`IBAN: •••• ${input.bank.iban_last4}`);
  if (input.bank.swift) lines.push(`SWIFT: ${input.bank.swift}`);
  lines.push(`Amount: ${major} ${input.currency}`);
  lines.push(`Reference: ${input.reference}`);
  return lines.join("\n");
}

export function PayInvoiceClient({
  invoiceId,
  locale,
}: {
  invoiceId: string;
  locale: "en" | "ar";
}) {
  const t = useTranslations("billing.pay");
  const router = useRouter();
  const qc = useQueryClient();
  const tenant = useAuthStore((s) => s.tenant);

  const invoiceQ = useQuery({
    queryKey: ["billing", "invoice", invoiceId],
    queryFn: () => invoiceGetRequest(invoiceId),
  });

  const banksQ = useQuery({
    queryKey: ["billing", "platform-banks", tenant?.default_currency_code],
    queryFn: () =>
      platformBankAccountsRequest({
        currency: tenant?.default_currency_code,
      }),
    staleTime: 5 * 60_000,
  });

  const [step, setStep] = useState<Step>(1);
  const [selectedBankId, setSelectedBankId] = useState<string>("");
  const [payerName, setPayerName] = useState<string>(tenant?.name ?? "");
  const [transferDate, setTransferDate] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [transferReference, setTransferReference] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedBankId && banksQ.data?.items[0]) {
      setSelectedBankId(banksQ.data.items[0].id);
    }
  }, [banksQ.data, selectedBankId]);

  // If the invoice is already in review or paid, jump to the awaiting step.
  useEffect(() => {
    if (!invoiceQ.data) return;
    if (invoiceQ.data.status === "in_review" || invoiceQ.data.status === "paid") {
      setStep(3);
    }
  }, [invoiceQ.data]);

  const submitMutation = useMutation({
    mutationFn: () => {
      if (!file) throw new Error("file");
      if (!invoiceQ.data) throw new Error("no invoice");
      return submitSubscriptionProof(invoiceId, {
        file,
        amount_cents: invoiceQ.data.amount_cents,
        currency_code: invoiceQ.data.currency_code,
        bank_account_id: selectedBankId,
        payer_name: payerName.trim(),
        transfer_date: transferDate,
        transfer_reference: transferReference.trim(),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["billing"] });
      setStep(3);
    },
    onError: (err) => {
      if (err instanceof ApiError) setError(err.message);
      else if ((err as Error).message === "file") setError(t("errors.fileRequired"));
      else setError(t("errors.network"));
    },
  });

  const banks: ApiPlatformBankAccount[] = banksQ.data?.items ?? [];
  const selectedBank = useMemo(
    () => banks.find((b) => b.id === selectedBankId) ?? null,
    [banks, selectedBankId],
  );

  if (invoiceQ.isPending) {
    return <div style={{ padding: 40, color: "var(--ink-3)" }}>{t("loading")}</div>;
  }
  if (invoiceQ.isError || !invoiceQ.data) {
    return <div style={{ padding: 40, color: "var(--rose)" }}>{t("errors.invoiceLoad")}</div>;
  }

  const invoice = invoiceQ.data;

  function copy(text: string, kind: string) {
    void navigator.clipboard.writeText(text).then(() => {
      setCopyMsg(kind);
      setTimeout(() => setCopyMsg(null), 1200);
    });
  }

  return (
    <div style={{ padding: "32px 0 96px", maxWidth: 720, marginInline: "auto" }}>
      <button
        type="button"
        onClick={() => router.push("/billing")}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          color: "var(--ink-3)",
          fontSize: 13,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          marginBottom: 16,
        }}
      >
        <ArrowLeft size={14} strokeWidth={1.5} className="rtl:rotate-180" />
        {t("back")}
      </button>

      <h1
        style={{
          fontFamily: "var(--serif)",
          fontSize: 32,
          letterSpacing: "-0.02em",
        }}
      >
        {t("title")}
      </h1>
      <p style={{ fontSize: 14, color: "var(--ink-3)", marginTop: 4 }}>
        {t("subtitle", { ref: invoice.reference_code })}
      </p>

      {/* Step indicators */}
      <div style={{ display: "flex", gap: 8, marginTop: 24, marginBottom: 24 }}>
        {([1, 2, 3] as const).map((s) => (
          <div
            key={s}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 999,
              background: s <= step ? "var(--accent)" : "var(--rule)",
            }}
          />
        ))}
      </div>
      <p style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 24 }}>
        {step === 1 && t("step1.kicker")}
        {step === 2 && t("step2.kicker")}
        {step === 3 && t("step3.kicker")}
      </p>

      {step === 1 && (
        <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h2 style={{ fontFamily: "var(--serif)", fontSize: 22 }}>
            {t("step1.heading", {
              amount: formatCents(invoice.amount_cents, invoice.currency_code),
            })}
          </h2>
          <p style={{ fontSize: 13, color: "var(--ink-3)" }}>{t("step1.body")}</p>

          {banksQ.isPending && (
            <div style={{ color: "var(--ink-3)" }}>{t("loading")}</div>
          )}
          {banks.length === 0 && !banksQ.isPending && (
            <div style={{ color: "var(--rose)", fontSize: 13 }}>{t("step1.noBanks")}</div>
          )}
          {banks.length > 1 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {banks.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setSelectedBankId(b.id)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 999,
                    background: b.id === selectedBankId ? "var(--accent)" : "transparent",
                    color: b.id === selectedBankId ? "white" : "var(--ink-2)",
                    border:
                      b.id === selectedBankId
                        ? "1px solid var(--accent)"
                        : "1px solid var(--rule)",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  {b.name_i18n[locale] || b.name_i18n.en}
                </button>
              ))}
            </div>
          )}

          {selectedBank && (
            <div className="billing-card" style={{ marginTop: 8 }}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  padding: "8px 0 16px",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    background: "white",
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid var(--rule)",
                  }}
                >
                  <QRCodeSVG
                    value={buildPaymentQrPayload({
                      bank: selectedBank,
                      amountCents: invoice.amount_cents,
                      currency: invoice.currency_code,
                      reference: invoice.reference_code,
                    })}
                    size={192}
                    bgColor="#FFFFFF"
                    fgColor="#1F1A17"
                    level="M"
                  />
                </div>
                <p
                  style={{
                    fontSize: 11.5,
                    color: "var(--ink-3)",
                    margin: 0,
                    textAlign: "center",
                  }}
                >
                  {t("bank.qrHint")}
                </p>
              </div>
              <BankField
                label={t("bank.bankName")}
                value={selectedBank.bank_name}
                onCopy={() => copy(selectedBank.bank_name, "bank")}
                copied={copyMsg === "bank"}
              />
              <BankField
                label={t("bank.holder")}
                value={selectedBank.account_holder}
                onCopy={() => copy(selectedBank.account_holder, "holder")}
                copied={copyMsg === "holder"}
              />
              {selectedBank.iban_last4 && (
                <BankField
                  label={t("bank.iban")}
                  value={`•••• •••• •••• ${selectedBank.iban_last4}`}
                  mono
                  onCopy={() => copy(`•••• •••• •••• ${selectedBank.iban_last4}`, "iban")}
                  copied={copyMsg === "iban"}
                />
              )}
              {selectedBank.swift && (
                <BankField
                  label={t("bank.swift")}
                  value={selectedBank.swift}
                  mono
                  onCopy={() => copy(selectedBank.swift!, "swift")}
                  copied={copyMsg === "swift"}
                />
              )}
              <BankField
                label={t("bank.currency")}
                value={selectedBank.currency_code}
              />
            </div>
          )}

          <div
            style={{
              background: "color-mix(in oklab, var(--accent) 8%, transparent)",
              border: "1px solid color-mix(in oklab, var(--accent) 22%, transparent)",
              borderRadius: 12,
              padding: 16,
              marginTop: 4,
            }}
          >
            <span className="kicker" style={{ color: "var(--accent)" }}>
              {t("reference.label")}
            </span>
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: 18,
                marginTop: 4,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span>{invoice.reference_code}</span>
              <button
                type="button"
                onClick={() => copy(invoice.reference_code, "ref")}
                style={{
                  background: "transparent",
                  border: "none",
                  color: copyMsg === "ref" ? "var(--sage)" : "var(--ink-3)",
                  cursor: "pointer",
                }}
                aria-label={t("reference.copy")}
              >
                {copyMsg === "ref" ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
            <p style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 6 }}>
              {t("reference.note")}
            </p>
          </div>

          <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={!selectedBank}
              style={{
                padding: "12px 22px",
                background: "var(--accent)",
                color: "white",
                border: "none",
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 500,
                cursor: selectedBank ? "pointer" : "not-allowed",
                opacity: selectedBank ? 1 : 0.6,
              }}
            >
              {t("step1.next")}
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h2 style={{ fontFamily: "var(--serif)", fontSize: 22 }}>{t("step2.heading")}</h2>

          <label
            style={{
              display: "block",
              padding: 24,
              border: "2px dashed var(--rule)",
              borderRadius: 14,
              textAlign: "center",
              cursor: "pointer",
              background: "var(--bg)",
            }}
          >
            <input
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              style={{ display: "none" }}
            />
            <FileUp size={28} strokeWidth={1.25} style={{ color: "var(--ink-3)" }} />
            <div style={{ fontSize: 14, marginTop: 8 }}>
              {file ? file.name : t("step2.upload")}
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4 }}>
              {t("step2.uploadHint")}
            </div>
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <FormField label={t("step2.payerName")}>
              <input
                value={payerName}
                onChange={(e) => setPayerName(e.target.value)}
                style={inputStyle()}
              />
            </FormField>
            <FormField label={t("step2.transferDate")}>
              <input
                type="date"
                value={transferDate}
                onChange={(e) => setTransferDate(e.target.value)}
                style={inputStyle()}
              />
            </FormField>
            <FormField label={t("step2.transferReference")}>
              <input
                value={transferReference}
                onChange={(e) => setTransferReference(e.target.value)}
                placeholder="e.g. WIRE-12345"
                style={inputStyle()}
              />
            </FormField>
            <FormField label={t("step2.amount")}>
              <input
                value={formatCents(invoice.amount_cents, invoice.currency_code)}
                readOnly
                style={{ ...inputStyle(), color: "var(--ink-3)" }}
              />
            </FormField>
          </div>

          {error && (
            <div
              role="alert"
              style={{
                background: "color-mix(in oklab, var(--rose) 14%, transparent)",
                color: "var(--rose)",
                padding: "10px 14px",
                borderRadius: 10,
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <button
              type="button"
              onClick={() => setStep(1)}
              style={{
                padding: "10px 18px",
                background: "transparent",
                border: "1px solid var(--rule)",
                borderRadius: 10,
                color: "var(--ink-2)",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {t("step2.back")}
            </button>
            <button
              type="button"
              disabled={submitMutation.isPending || !file || !payerName.trim() || !transferReference.trim()}
              onClick={() => {
                setError(null);
                submitMutation.mutate();
              }}
              style={{
                padding: "12px 22px",
                background: "var(--accent)",
                color: "white",
                border: "none",
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 500,
                cursor: submitMutation.isPending ? "not-allowed" : "pointer",
                opacity: submitMutation.isPending ? 0.6 : 1,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {submitMutation.isPending && <Loader2 size={14} className="animate-spin" />}
              {submitMutation.isPending ? t("step2.submitting") : t("step2.submit")}
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section style={{ textAlign: "center", paddingBlock: 32 }}>
          <div
            aria-hidden
            style={{
              width: 64,
              height: 64,
              margin: "0 auto",
              borderRadius: "50%",
              background: "var(--sage-soft, color-mix(in oklab, var(--sage) 16%, transparent))",
              display: "grid",
              placeItems: "center",
              color: "var(--sage)",
            }}
          >
            <Check size={28} strokeWidth={2} />
          </div>
          <h2
            style={{
              fontFamily: "var(--serif)",
              fontSize: 26,
              letterSpacing: "-0.02em",
              marginTop: 16,
            }}
          >
            {t("step3.heading")}
          </h2>
          <p style={{ fontSize: 14, color: "var(--ink-3)", marginTop: 8, maxWidth: 480, marginInline: "auto" }}>
            {t("step3.body", {
              amount: formatCents(invoice.amount_cents, invoice.currency_code),
              ref: invoice.reference_code,
            })}
          </p>
          <Link
            href="/billing"
            style={{
              display: "inline-block",
              marginTop: 24,
              padding: "10px 18px",
              background: "var(--accent)",
              color: "white",
              borderRadius: 10,
              textDecoration: "none",
              fontSize: 13,
            }}
          >
            {t("step3.cta")}
          </Link>
        </section>
      )}
    </div>
  );
}

function BankField({
  label,
  value,
  mono,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  mono?: boolean;
  onCopy?: () => void;
  copied?: boolean;
}) {
  const t = useTranslations("billing.pay");
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        paddingBlock: 8,
        borderBottom: "1px solid var(--rule)",
      }}
    >
      <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{label}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontFamily: mono ? "var(--mono)" : "inherit", fontSize: 13 }}>{value}</span>
        {onCopy && (
          <button
            type="button"
            onClick={onCopy}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: copied ? "var(--sage)" : "var(--ink-3)",
              padding: 4,
            }}
            aria-label={t("copy")}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
        )}
      </span>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ fontSize: 12, color: "var(--ink-3)", display: "block", marginBottom: 6 }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    width: "100%",
    height: 40,
    padding: "0 12px",
    borderRadius: 8,
    border: "1px solid var(--rule)",
    background: "var(--bg)",
    color: "var(--ink)",
    fontSize: 14,
    fontFamily: "inherit",
    outline: "none",
  };
}
