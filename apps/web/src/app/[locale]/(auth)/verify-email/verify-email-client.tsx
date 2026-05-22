"use client";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Link } from "../../../../../i18n/routing";
import { resendVerificationRequest, verifyEmailRequest } from "../../../../lib/api/auth";
import { ApiError } from "../../../../lib/api/client";

type State = "loading" | "ok" | "expired" | "invalid";

export function VerifyEmailClient({ token }: { token: string }) {
  const t = useTranslations("auth.verify");
  const [state, setState] = useState<State>("loading");
  const [resendEmail, setResendEmail] = useState("");
  const [resendDone, setResendDone] = useState(false);

  const resendMutation = useMutation({
    mutationFn: resendVerificationRequest,
    onSuccess: () => setResendDone(true),
  });

  useEffect(() => {
    if (!token) {
      setState("invalid");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await verifyEmailRequest({ token });
        if (!cancelled) setState("ok");
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError) {
          if (err.code === "verify_token_expired") setState("expired");
          else setState("invalid");
        } else {
          setState("invalid");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div>
      {state === "loading" && (
        <div>
          <h1 style={{ fontFamily: "var(--serif)", fontSize: 32 }}>{t("loading")}</h1>
        </div>
      )}

      {state === "ok" && (
        <StatusCard
          icon={<CheckCircle2 size={32} strokeWidth={1.5} color="var(--sage)" />}
          title={t("successTitle")}
          body={t("successBody")}
          cta={
            <Link
              href="/login"
              className="mt-7 inline-flex h-12 items-center justify-center gap-2 rounded-xl px-6 text-[15px] font-medium"
              style={{ background: "var(--accent)", color: "white" }}
            >
              ← Back to sign in
            </Link>
          }
        />
      )}

      {state === "expired" && (
        <StatusCard
          icon={<AlertTriangle size={32} strokeWidth={1.5} color="var(--rose)" />}
          title={t("expiredTitle")}
          body={t("expiredBody")}
          cta={
            resendDone ? (
              <div className="mt-4 text-sm" style={{ color: "var(--sage)" }}>{t("resendDone")}</div>
            ) : (
              <form
                className="mt-5 flex w-full max-w-sm flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  resendMutation.mutate({ email: resendEmail });
                }}
              >
                <input
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  className="rounded-xl border px-3 py-2.5 outline-none"
                  style={{
                    borderColor: "var(--rule)",
                    background: "var(--bg)",
                    fontSize: 14,
                    color: "var(--ink)",
                    fontFamily: "inherit",
                  }}
                />
                <button
                  type="submit"
                  disabled={resendMutation.isPending}
                  className="inline-flex h-11 items-center justify-center rounded-xl text-[14px] font-medium disabled:opacity-60"
                  style={{ background: "var(--accent)", color: "white" }}
                >
                  {t("resend")}
                </button>
              </form>
            )
          }
        />
      )}

      {state === "invalid" && (
        <StatusCard
          icon={<XCircle size={32} strokeWidth={1.5} color="var(--rose)" />}
          title={t("invalidTitle")}
          body={t("invalidBody")}
        />
      )}
    </div>
  );
}

function StatusCard({
  icon,
  title,
  body,
  cta,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  cta?: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-3">{icon}</div>
      <h1
        style={{
          fontFamily: "var(--serif)",
          fontSize: 32,
          letterSpacing: "-0.02em",
          lineHeight: 1.15,
        }}
      >
        {title}
      </h1>
      <p className="mt-2" style={{ color: "var(--ink-3)", fontSize: 14 }}>
        {body}
      </p>
      {cta}
    </div>
  );
}
