import { withSentryConfig } from "@sentry/nextjs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// See apps/web/next.config.mjs for the rationale. Next.js wants a relative
// distDir; we compute it dynamically so the path is correct regardless of
// where the repo sits in the filesystem.
function resolveDistDir() {
  if (process.env.MADAR_NEXT_LOCAL === "1") return ".next";
  if (process.platform !== "win32") return ".next";
  const projectDir = path.dirname(fileURLToPath(import.meta.url));
  const target = path.join(os.homedir(), ".madar-cache", "admin", ".next");
  return path.relative(projectDir, target);
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@madar/ui"],
  distDir: resolveDistDir(),
};

export default withSentryConfig(nextConfig, {
  silent: true,
  sourcemaps: { disable: true },
  disableLogger: true,
});
