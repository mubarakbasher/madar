// Runs the Prisma CLI with the repo-root .env loaded.
//
// Prisma looks for .env beside the schema (packages/db), but this repo keeps a
// single .env at the root — so `pnpm db:reset` and friends failed with
// "Environment variable not found: DIRECT_DATABASE_URL" on a clean shell, even
// though every documented workflow says to run them. Real environment
// variables still win over the file.
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const here = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(here, "../../../.env") });

const result = spawnSync("prisma", process.argv.slice(2), {
  stdio: "inherit",
  shell: true,
});
process.exit(result.status ?? 1);
