import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Playwright E2E specs live under e2e/ and use @playwright/test's own
// test() — Vitest's default glob would otherwise pick them up too and
// crash trying to run them under the wrong test runner.
const exclude = ["e2e/**", "**/node_modules/**"];

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // `server-only` throws unless resolved with the react-server condition,
      // which Next.js applies to server code but Vitest does not. Tests run
      // server modules directly, so point it at the package's no-op build.
      "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    passWithNoTests: true,
    setupFiles: ["./vitest-setup-dom.ts"],
    exclude,
  },
});
