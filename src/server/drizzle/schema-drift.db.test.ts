import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateDrizzleJson } from "drizzle-kit/api";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { is } from "drizzle-orm";
import { TEST_DATABASE_URL } from "@/server/db/test-database-url";
import { withRollback } from "@/server/db/test-db";
import { loadSchema } from "@/server/drizzle/test-utils";

// B1 / B9. The SQL migrations build
// the database; the schema folder describes it to TypeScript. The test database
// has every migration applied (supabase db reset), so this introspects it with
// `drizzle-kit pull` and compares the result with what the schema folder declares:
// tables, columns, types, nullability, defaults, enums, primary/unique/
// foreign keys (with ON DELETE), checks, indexes and RLS. A change made on
// only one side fails here, with the differing path in the diff.

// Pull spells a few things differently from the schema folder without them meaning
// anything: it labels every index column with an operator class (and gets
// some wrong), names the default `public` schema explicitly, and adds
// snapshot ids and an `internal` block of its own bookkeeping at the top.
const SNAPSHOT_BOOKKEEPING = new Set(["id", "prevId", "internal"]);

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, v]) => key !== "opclass" && !((key === "schemaTo" || key === "typeSchema") && v === "public"))
      .map(([key, v]) => [key, normalizeValue(v)]),
  );
}

function normalize(snapshot: object): unknown {
  return normalizeValue(Object.fromEntries(Object.entries(snapshot).filter(([key]) => !SNAPSHOT_BOOKKEEPING.has(key))));
}

function pullDatabaseSnapshot(): object {
  const out = mkdtempSync(join(tmpdir(), "drizzle-pull-"));
  try {
    execFileSync(
      "pnpm",
      ["exec", "drizzle-kit", "pull", "--dialect", "postgresql", "--url", TEST_DATABASE_URL, "--out", out],
      { stdio: "pipe" },
    );
    return JSON.parse(readFileSync(join(out, "meta", "0000_snapshot.json"), "utf8"));
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

describe("the schema folder matches the database the migrations build", () => {
  it("B1: every table, column, constraint and index agrees", async () => {
    expect(normalize(generateDrizzleJson(await loadSchema()))).toEqual(normalize(pullDatabaseSnapshot()));
  }, 60_000);

  // Both sides agreeing is not enough: if a table lost RLS in the schema folder and
  // in a migration at the same time, B1 would still pass.
  it("B9: every table keeps row level security on, in the schema folder and in the database", async () => {
    await withRollback(async (db) => {
      const { rows } = await db.query<{ name: string }>(
        "select relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity",
      );
      expect({ rlsOffInDatabase: rows.map((r) => r.name) }).toEqual({ rlsOffInDatabase: [] });
    });
    const exported: unknown[] = Object.values(await loadSchema());
    const rlsOffInSchema = exported
      .filter((value): value is PgTable => is(value, PgTable))
      .map((table) => getTableConfig(table))
      .filter((config) => !config.enableRLS)
      .map((config) => config.name);
    expect({ rlsOffInSchema }).toEqual({ rlsOffInSchema: [] });
  });
});
