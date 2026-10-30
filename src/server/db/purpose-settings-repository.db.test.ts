import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Client } from "pg";
import { press } from "@/server/db/press";
import { TEST_DATABASE_URL } from "@/server/db/test-database-url";
import { PurposeSettingsRepository } from "@/server/repositories/purpose-settings-repository";

// The purpose settings repository against the local database through the
// real getDb() pool, writing the way the actions do. The rows are fixed and
// these writes commit, so afterAll restores the row it touches (and its
// pricing rows). The per-role pricing writes are covered in
// purpose-role-pricing-repository.db.test.ts.

const repo = new PurposeSettingsRepository();

type PurposeDbRow = {
  allowed_roles: string;
  archived_at: Date | null;
  updated_by: string | null;
};

const SELECT_YOGA = "select allowed_roles::text, archived_at, updated_by from purpose_settings where purpose = 'yoga'";

let admin: Client;
let original: PurposeDbRow;
let originalPricing: Record<string, unknown>[];

async function yoga(): Promise<PurposeDbRow> {
  const { rows } = await admin.query<PurposeDbRow>(SELECT_YOGA);
  return rows[0];
}

beforeAll(async () => {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  admin = new Client({ connectionString: TEST_DATABASE_URL });
  await admin.connect();
  original = await yoga();
  originalPricing = (await admin.query("select * from purpose_role_pricing where purpose = 'yoga'")).rows;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterAll(async () => {
  await admin.query("begin");
  await admin.query(
    "update purpose_settings set allowed_roles = $1::role[], archived_at = $2, updated_by = $3 where purpose = 'yoga'",
    [original.allowed_roles, original.archived_at, original.updated_by],
  );
  await admin.query("delete from purpose_role_pricing where purpose = 'yoga'");
  await admin.query(
    "insert into purpose_role_pricing select * from json_populate_recordset(null::purpose_role_pricing, $1)",
    [JSON.stringify(originalPricing)],
  );
  await admin.query("commit");
  await admin.end();
  vi.restoreAllMocks();
});

describe("PurposeSettingsRepository", () => {
  it("listAll maps every row with its role pricing; no pricing row is an empty map", async () => {
    const settings = await repo.listAll();
    expect(settings).toHaveLength(8);
    expect(settings.find((s) => s.purpose === "performance")).toMatchObject({
      allowedRoles: ["teacher"],
      rolePricing: { teacher: { mode: "price", roomA: 100, roomB: 100 } },
    });
    expect(settings.find((s) => s.purpose === "front_desk")?.rolePricing).toEqual({});
  });

  it("update writes roles and updated_by", async () => {
    await press(() => repo.update("yoga", { allowedRoles: ["teacher", "customer"], rolePricing: {} }, "repo 測試"));
    expect(await yoga()).toMatchObject({ allowed_roles: "{teacher,customer}", updated_by: "repo 測試" });
  });

  it("setArchived sets and clears archived_at", async () => {
    await press(() => repo.setArchived("yoga", true, "repo 測試"));
    expect((await yoga()).archived_at).not.toBeNull();
    await press(() => repo.setArchived("yoga", false, "repo 測試"));
    expect((await yoga()).archived_at).toBeNull();
  });

  it("a rejected write rolls back and comes back as a classified failure", async () => {
    const roles = (await yoga()).allowed_roles;

    const result = await press(() => repo.update("yoga", { allowedRoles: [], rolePricing: {} }, "repo 測試"));

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "message", code: "INVALID_ARGUMENT", message: "資料不符合規則，請檢查後再試一次" },
    });
    expect((await yoga()).allowed_roles).toBe(roles);
  });
});
