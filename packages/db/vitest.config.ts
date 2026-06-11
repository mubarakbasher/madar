import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    testTimeout: 30_000,
    hookTimeout: 60_000,
    setupFiles: ["./test/env-setup.ts", "./test/setup.ts"],
    include: ["test/**/*.test.ts"],
  },
});
