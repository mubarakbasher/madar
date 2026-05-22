import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// On Windows + OneDrive, Next.js's recursive-delete of `.next/` trips on
// reparse-point placeholders OneDrive creates for cloud-synced files. Move
// the build cache outside the synced tree to dodge it.
//
// Next.js requires `distDir` to be a relative path (it does `path.join`
// against the project dir), so we compute the relative path from the project
// dir to `~/.madar-cache/web/.next`. Linux containers keep the default
// in-repo `.next`. Override with `MADAR_NEXT_LOCAL=1` to force in-repo on Win.
function resolveDistDir() {
  if (process.env.MADAR_NEXT_LOCAL === "1") return ".next";
  if (process.platform !== "win32") return ".next";
  const projectDir = path.dirname(fileURLToPath(import.meta.url));
  const target = path.join(os.homedir(), ".madar-cache", "web", ".next");
  return path.relative(projectDir, target);
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@madar/ui"],
  distDir: resolveDistDir(),
};

export default withSentryConfig(withNextIntl(nextConfig), {
  silent: true,
  // Source-map upload deferred — needs SENTRY_AUTH_TOKEN + CI wiring.
  sourcemaps: { disable: true },
  // Don't run any Sentry CLI hooks during dev builds.
  disableLogger: true,
});
