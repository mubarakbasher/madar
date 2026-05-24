"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { adminAcceptInvite } from "@/lib/api/admin-team";
import { ApiError } from "@/lib/api/client";

export function AcceptInviteClient() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!token) {
    return (
      <div className="space-y-4">
        <h1 className="font-serif text-3xl text-ink tracking-tight">Invalid invite link</h1>
        <p className="font-sans text-sm text-ink-3">
          This invitation link is missing required parameters. Please check your email for the correct link.
        </p>
      </div>
    );
  }

  if (success) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <ShieldCheck size={24} strokeWidth={1.5} className="text-accent" />
          <h1 className="font-serif text-3xl text-ink tracking-tight">Account activated</h1>
        </div>
        <p className="font-sans text-sm text-ink-3">
          Your password has been set. You can now sign in with your credentials.
          MFA setup will be required on first login.
        </p>
        <button
          type="button"
          className="w-full rounded-md bg-accent px-4 py-3 font-sans text-sm font-medium text-white shadow-sm hover:opacity-90 transition"
          onClick={() => router.push("/login")}
        >
          Go to sign in
        </button>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 12) {
      setError("Password must be at least 12 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await adminAcceptInvite({ token, password });
      setSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "invite_invalid") {
          setError("This invite link is invalid or has expired. Please request a new invitation.");
        } else {
          setError(err.message || "Something went wrong. Please try again.");
        }
      } else {
        setError("Network error. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <header className="space-y-2">
        <h1 className="font-serif text-3xl text-ink tracking-tight">
          Set your password
        </h1>
        <p className="font-sans text-sm text-ink-3">
          Create a secure password (min 12 characters) to activate your admin account.
        </p>
      </header>

      <div className="space-y-1.5">
        <label htmlFor="new-password" className="block font-sans text-xs font-medium text-ink-2">
          Password
        </label>
        <div className="relative">
          <input
            id="new-password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            autoFocus
            required
            minLength={12}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Minimum 12 characters"
            className="w-full rounded-md border border-rule bg-bg-elev px-3 py-2.5 pe-10 font-sans text-sm text-ink placeholder:text-ink-4 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute end-2 top-1/2 -translate-y-1/2 p-1.5 text-ink-4 hover:text-ink-2 transition"
            tabIndex={-1}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" strokeWidth={1.5} />
            ) : (
              <Eye className="h-4 w-4" strokeWidth={1.5} />
            )}
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="confirm-password" className="block font-sans text-xs font-medium text-ink-2">
          Confirm password
        </label>
        <input
          id="confirm-password"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={128}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Re-enter your password"
          className="w-full rounded-md border border-rule bg-bg-elev px-3 py-2.5 font-sans text-sm text-ink placeholder:text-ink-4 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition"
        />
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-rose/30 bg-rose-soft px-3 py-2.5 font-sans text-xs text-ink"
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-accent px-4 py-3 font-sans text-sm font-medium text-white shadow-sm hover:opacity-90 transition disabled:opacity-60"
      >
        {submitting ? "Activating..." : "Activate account"}
      </button>

      <p className="font-sans text-[11px] text-ink-4 text-center">
        After activation you will need to set up two-factor authentication on first sign-in.
      </p>
    </form>
  );
}
