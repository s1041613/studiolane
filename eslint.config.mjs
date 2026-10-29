import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const here = path.dirname(fileURLToPath(import.meta.url));
const componentsDir = path.join(here, "src/components");

const featureFolders = fs.existsSync(componentsDir)
  ? fs
      .readdirSync(componentsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== "ui" && entry.name !== "shared")
      .map((entry) => entry.name)
  : [];

const internalOnlyPaths = [
  {
    name: "@/components/ui/alert-dialog",
    message: "ui/alert-dialog is an internal primitive. Use ConfirmDialog or NoticeDialog instead.",
  },
  {
    name: "@/lib/click-guard",
    message: "lib/click-guard is an internal primitive. Use ActionButton/ConfirmDialog's built-in pending instead.",
  },
];

// A `no-restricted-imports` "group" pattern that blocks every
// src/components/<name>/** folder except the ones listed in `allowed`.
// Starts from `@/components/*/**` (one wildcard segment), not
// `@/components/**`: the `ignore` npm package this rule runs on can't
// un-ignore a path whose parent directory is itself excluded by a `**`
// pattern, so negating `@/components/ui/**` against a blanket
// `@/components/**` silently fails to re-include ui/'s own files.
function blockOtherComponentFolders(allowed) {
  return ["@/components/*/**", ...allowed.map((name) => `!@/components/${name}/**`)];
}

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/server/drizzle/schema/**/*.ts"],
    rules: { "import/no-cycle": "error" },
  },
  {
    files: ["src/components/ui/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/server/**"],
              message: "ui/ doesn't know business code. Keep this logic at the call site, or move it to shared/.",
            },
            {
              group: blockOtherComponentFolders(["ui"]),
              message: "ui/ may only import from ui/ itself, not shared/ or a feature folder.",
            },
          ],
        },
      ],
    },
  },
  ...featureFolders.map((feature) => ({
    files: [`src/components/${feature}/**/*.{ts,tsx}`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: blockOtherComponentFolders([feature, "ui", "shared"]),
              message: `${feature}/ may only import @/components/ui/** and @/components/shared/**, not another feature folder.`,
            },
          ],
          paths: internalOnlyPaths,
        },
      ],
    },
  })),
  {
    files: ["src/components/shared/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: blockOtherComponentFolders(["ui", "shared"]),
              message: `shared/ may only import @/components/ui/** and from shared/ itself, not a feature folder (${featureFolders.join(", ")}).`,
            },
          ],
          paths: internalOnlyPaths,
        },
      ],
    },
  },
  {
    files: ["src/app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { paths: internalOnlyPaths }],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Sibling worktrees (see .gitignore) have their own .next/** build
    // output that the root-relative ignore above doesn't reach.
    ".worktrees/**",
  ]),
]);

export default eslintConfig;
