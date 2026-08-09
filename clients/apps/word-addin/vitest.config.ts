import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Upstream shipped no tests. Ours live under `src/claidor/` and are pure
 * functions by design — anything that touches Office.js is not testable
 * outside Word, so the parts worth testing are the ones that are not.
 */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
