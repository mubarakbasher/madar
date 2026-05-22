/**
 * English-only label constants. The admin app skips next-intl entirely.
 * Centralized here so copy changes don't sprawl across components.
 */
export const labels = {
  brand: {
    name: "Madar",
    panel: "Admin Panel",
  },
  auth: {
    login: {
      heading: "Welcome back",
      subtitle: "Sign in to your Madar admin workspace.",
      emailLabel: "Email",
      emailPlaceholder: "admin@platform.test",
      passwordLabel: "Password",
      passwordPlaceholder: "Your password",
      remember: "Keep me signed in on this device",
      showPassword: "Show password",
      hidePassword: "Hide password",
      submit: "Sign in",
      submitting: "Signing in…",
      footHint: "Need access?",
      footAction: "Contact your platform owner",
      errors: {
        invalidCredentials: "Email or password is incorrect.",
        mfaNotEnrolled:
          "Multi-factor authentication is required but not yet enrolled. Contact the platform owner.",
        rateLimited: "Too many attempts — wait a minute, then try again.",
        network: "Network error — please try again.",
        unknown: "Something went wrong. Please try again.",
      },
    },
    mfa: {
      heading: "Two-step verification",
      subtitle: "Enter the 6-digit code from your authenticator app.",
      signedInAs: "Signed in as",
      submit: "Verify and sign in",
      submitting: "Verifying…",
      back: "← Back to password",
      recoveryComingSoon: "Use recovery code",
      recoveryHint: "Coming soon",
      lostAccessPrompt: "Lost access to your authenticator?",
      lostAccessAction: "Contact your workspace owner",
      errors: {
        invalid: "Verification code is incorrect — try again.",
        pendingInvalid: "Your verification session expired — sign in again.",
        rateLimited: "Too many attempts — wait a minute, then try again.",
        unknown: "Something went wrong. Please try again.",
      },
    },
  },
  home: {
    welcome: (name: string) => `Welcome, ${name}`,
    placeholder:
      "The admin dashboard ships in task 1.14. This page just proves the auth round-trip works end-to-end.",
    signOut: "Sign out",
    signingOut: "Signing out…",
  },
} as const;
