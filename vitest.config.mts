import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

/**
 * The alias is written out by hand rather than pulled from `tsconfig.json` via
 * `vite-tsconfig-paths`: the tsconfig has no `baseUrl`, just
 * `paths: { "@/*": ["./*"] }`, so the mapping is one line and not worth a
 * dependency.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)).replace(/\/$/, ""),
    },
  },
})
