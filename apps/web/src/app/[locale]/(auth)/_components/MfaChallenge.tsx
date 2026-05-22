"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ClipboardEvent,
} from "react";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";

const DIGITS = 6;

export interface MfaChallengeProps {
  signedInAs: string;
  submitting: boolean;
  error: string | null;
  onSubmit: (code: string) => void;
  onBack: () => void;
}

/**
 * Six-digit TOTP pad with auto-advance + paste-distribute + Enter-submit,
 * plus a "Use recovery code" toggle that swaps to a single xxxx-xxxx input.
 * Ported (intentionally duplicated) from apps/admin/src/app/(auth)/login.
 */
export function MfaChallenge({ signedInAs, submitting, error, onSubmit, onBack }: MfaChallengeProps) {
  const t = useTranslations("auth.mfa.challenge");
  const [mode, setMode] = useState<"totp" | "recovery">("totp");
  const [digits, setDigits] = useState<string[]>(() => Array(DIGITS).fill(""));
  const [recoveryCode, setRecoveryCode] = useState("");
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (mode === "totp") inputsRef.current[0]?.focus();
  }, [mode]);

  const totpComplete = useMemo(() => digits.every((d) => /^\d$/.test(d)), [digits]);
  const recoveryComplete = useMemo(
    () => /^[a-z0-9]{4}-?[a-z0-9]{4}$/i.test(recoveryCode.trim()),
    [recoveryCode],
  );

  const canSubmit =
    !submitting && (mode === "totp" ? totpComplete : recoveryComplete);

  const submit = useCallback(() => {
    if (!canSubmit) return;
    const code = mode === "totp" ? digits.join("") : recoveryCode.trim();
    onSubmit(code);
  }, [canSubmit, mode, digits, recoveryCode, onSubmit]);

  const handleKey = (i: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
      return;
    }
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      inputsRef.current[i - 1]?.focus();
      return;
    }
    if (e.key === "ArrowLeft" && i > 0) {
      e.preventDefault();
      inputsRef.current[i - 1]?.focus();
      return;
    }
    if (e.key === "ArrowRight" && i < DIGITS - 1) {
      e.preventDefault();
      inputsRef.current[i + 1]?.focus();
    }
  };

  const handleChange = (i: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const cleaned = raw.replace(/\D/g, "").slice(0, 1);
    setDigits((prev) => {
      const next = [...prev];
      next[i] = cleaned;
      return next;
    });
    if (cleaned && i < DIGITS - 1) {
      inputsRef.current[i + 1]?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, DIGITS);
    if (text.length === 0) return;
    e.preventDefault();
    setDigits((prev) => {
      const next = [...prev];
      for (let i = 0; i < DIGITS; i++) next[i] = text[i] ?? "";
      return next;
    });
    const focusIndex = Math.min(text.length, DIGITS - 1);
    inputsRef.current[focusIndex]?.focus();
  };

  return (
    <div>
      <h1
        style={{
          fontFamily: "var(--serif)",
          fontSize: 32,
          letterSpacing: "-0.02em",
          lineHeight: 1.15,
        }}
      >
        {t("title")}
      </h1>
      <p className="mt-2" style={{ color: "var(--ink-3)", fontSize: 14 }}>
        {t("subtitle", { email: signedInAs })}
      </p>

      <form
        className="mt-7 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {mode === "totp" ? (
          <div className="flex gap-2" dir="ltr">
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => {
                  inputsRef.current[i] = el;
                }}
                inputMode="numeric"
                autoComplete="one-time-code"
                value={d}
                maxLength={1}
                onChange={handleChange(i)}
                onKeyDown={handleKey(i)}
                onPaste={i === 0 ? handlePaste : undefined}
                aria-label={`${t("pad")} ${i + 1}`}
                className="block rounded-xl border text-center font-serif text-[28px]"
                style={{
                  width: 48,
                  height: 60,
                  borderColor: "var(--rule)",
                  background: "var(--bg)",
                  color: "var(--ink)",
                  fontFamily: "var(--serif)",
                }}
              />
            ))}
          </div>
        ) : (
          <input
            type="text"
            value={recoveryCode}
            onChange={(e) => setRecoveryCode(e.target.value)}
            placeholder="abcd-efgh"
            aria-label={t("useRecovery")}
            className="block rounded-xl border px-3 py-3 font-mono text-[16px]"
            style={{ borderColor: "var(--rule)", background: "var(--bg)", color: "var(--ink)" }}
          />
        )}

        <button
          type="button"
          onClick={() => setMode((m) => (m === "totp" ? "recovery" : "totp"))}
          className="self-start text-[12px] underline underline-offset-4"
          style={{ color: "var(--ink-3)" }}
        >
          {mode === "totp" ? t("useRecovery") : t("useTotp")}
        </button>

        {error && (
          <div
            role="alert"
            className="rounded-lg px-3 py-2 text-sm"
            style={{
              background: "color-mix(in oklab, var(--rose) 14%, transparent)",
              color: "var(--rose)",
              border: "1px solid color-mix(in oklab, var(--rose) 24%, transparent)",
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-2 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-medium transition disabled:opacity-60"
          style={{
            background: "var(--accent)",
            color: "white",
            boxShadow:
              "0 6px 24px -14px color-mix(in oklab, var(--accent) 70%, transparent)",
          }}
        >
          {submitting ? t("submitting") : t("submit")}
          <ArrowRight size={16} strokeWidth={1.5} className="rtl:rotate-180" />
        </button>

        <button
          type="button"
          onClick={onBack}
          className="self-center text-[12px] underline underline-offset-4"
          style={{ color: "var(--ink-3)" }}
        >
          ← {t("back")}
        </button>
      </form>
    </div>
  );
}
