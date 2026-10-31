import { defineConfig, devices } from "@playwright/test";

// No accounts, no login: auth here is a stub that always returns a demo
// admin (AGENTS.md), so there's no 'setup' project or storageState to wire up.
const WRITE_SPECS = /\.write\.spec\.ts$/;

// A dedicated port (not 3000) so this suite can run next to another local
// dev server or Supabase stack without colliding.
const PORT = process.env.E2E_PORT ?? "3101";
const BASE_URL = `http://localhost:${PORT}`;

// The write spec's own local Supabase connection, forwarded to the dev
// server this config starts. Left out entirely when unset, so a misconfigured
// run fails on a missing/wrong connection instead of silently masking it as
// an empty string.
const FORWARDED_ENV_KEYS = ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_PUBLISHABLE_KEY"] as const;

function forwardedEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of FORWARDED_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return env;
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, testIgnore: WRITE_SPECS },
    // settings-rules.write.spec.ts skips itself unless E2E_WRITES=1 and
    // SUPABASE_URL is local (CI's throwaway stack); it saves, archives and
    // edits rows, so it runs alone, after the read-only project asserts on
    // seed data.
    {
      name: "writes",
      use: { ...devices["Desktop Chrome"] },
      testMatch: WRITE_SPECS,
      workers: 1,
      dependencies: ["chromium"],
    },
  ],

  // Never reuse a running server: it may point at another Supabase (e.g.
  // production via .env.local). Start our own; these process env values win
  // over .env.local since Next.js only falls back to a .env file for a
  // variable process.env doesn't already define.
  webServer: {
    command: `pnpm dev -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    env: forwardedEnv(),
  },
});
