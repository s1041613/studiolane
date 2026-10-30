import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "pg";
import { press } from "@/server/db/press";
import { TEST_DATABASE_URL } from "@/server/db/test-database-url";
import type { PurposeChange } from "@/server/logic/purpose-form";
import { PurposeSettingsRepository } from "@/server/repositories/purpose-settings-repository";

// PurposeSettingsRepository.update writing purpose_role_pricing (E-5 T23,
// T26, T31) through the real getDb() pool inside one transaction, like the
// action does. These writes commit, so beforeEach starts yoga from no pricing
// rows and afterAll restores yoga.

const repo = new PurposeSettingsRepository();
const ALL_ROLES: PurposeChange["allowedRoles"] = ["teacher", "staff", "customer"];

type PricingDbRow = {
  id: string;
  role: string;
  mode: string;
  rate_a: number | null;
  rate_b: number | null;
  pay_percent: number | null;
  updated_by: string | null;
};

let admin: Client;
let originalRoles: string;
let originalPricing: Record<string, unknown>[];

async function yogaPricing(): Promise<PricingDbRow[]> {
  const { rows } = await admin.query<PricingDbRow>(
    "select id, role::text, mode::text, rate_a, rate_b, pay_percent, updated_by from purpose_role_pricing where purpose = 'yoga' order by role",
  );
  return rows;
}

async function yogaRoles(): Promise<string> {
  const { rows } = await admin.query<{ allowed_roles: string }>(
    "select allowed_roles::text from purpose_settings where purpose = 'yoga'",
  );
  return rows[0].allowed_roles;
}

function save(change: PurposeChange, updatedBy = "pricing 測試", after?: () => Promise<void>) {
  return press(async () => {
    await repo.update("yoga", change, updatedBy);
    await after?.();
  });
}

beforeAll(async () => {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  admin = new Client({ connectionString: TEST_DATABASE_URL });
  await admin.connect();
  originalRoles = await yogaRoles();
  originalPricing = (await admin.query("select * from purpose_role_pricing where purpose = 'yoga'")).rows;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

beforeEach(async () => {
  await admin.query("delete from purpose_role_pricing where purpose = 'yoga'");
  await admin.query(
    "update purpose_settings set allowed_roles = '{teacher,staff,customer}', archived_at = null where purpose = 'yoga'",
  );
});

afterAll(async () => {
  await admin.query("begin");
  await admin.query("update purpose_settings set allowed_roles = $1::role[] where purpose = 'yoga'", [originalRoles]);
  await admin.query("delete from purpose_role_pricing where purpose = 'yoga'");
  await admin.query(
    "insert into purpose_role_pricing select * from json_populate_recordset(null::purpose_role_pricing, $1)",
    [JSON.stringify(originalPricing)],
  );
  await admin.query("commit");
  await admin.end();
  vi.restoreAllMocks();
});

describe("PurposeSettingsRepository.update role pricing", () => {
  it("T23: inserts, updates and deletes a role's row", async () => {
    // insert
    expect(
      await save({ allowedRoles: ALL_ROLES, rolePricing: { customer: { mode: "price", roomA: 500, roomB: 200 } } }),
    ).toEqual({ ok: true, data: null });
    const [inserted] = await yogaPricing();
    expect(inserted).toMatchObject({
      role: "customer",
      mode: "price",
      rate_a: 500,
      rate_b: 200,
      pay_percent: null,
      updated_by: "pricing 測試",
    });

    // update: the same row switches mode, the other mode's columns are cleared
    expect(await save({ allowedRoles: ALL_ROLES, rolePricing: { customer: { mode: "discount", payPercent: 85 } } })).toEqual(
      { ok: true, data: null },
    );
    expect(await yogaPricing()).toEqual([
      { ...inserted, mode: "discount", rate_a: null, rate_b: null, pay_percent: 85 },
    ]);

    // the same values again: nothing written
    await save({ allowedRoles: ALL_ROLES, rolePricing: { customer: { mode: "discount", payPercent: 85 } } }, "someone else");
    expect((await yogaPricing())[0].updated_by).toBe("pricing 測試");

    // delete: back to 方案價格
    expect(await save({ allowedRoles: ALL_ROLES, rolePricing: {} })).toEqual({ ok: true, data: null });
    expect(await yogaPricing()).toEqual([]);
  });

  it("T23 / B4: closing a role deletes its row; pricing sent for a closed role is ignored", async () => {
    await save({
      allowedRoles: ALL_ROLES,
      rolePricing: { teacher: { mode: "discount", payPercent: 80 }, customer: { mode: "price", roomA: 500, roomB: 200 } },
    });
    await save({
      allowedRoles: ["teacher", "staff"],
      rolePricing: { teacher: { mode: "discount", payPercent: 80 }, customer: { mode: "price", roomA: 500, roomB: 200 } },
    });
    expect(await yogaPricing()).toMatchObject([{ role: "teacher", mode: "discount", pay_percent: 80 }]);
  });

  it("listAll reads the rows back as rolePricing", async () => {
    await save({
      allowedRoles: ALL_ROLES,
      rolePricing: { teacher: { mode: "discount", payPercent: 80 }, staff: { mode: "price", roomA: 100, roomB: 50 } },
    });
    const yoga = (await repo.listAll()).find((s) => s.purpose === "yoga");
    expect(yoga?.rolePricing).toEqual({
      teacher: { mode: "discount", payPercent: 80 },
      staff: { mode: "price", roomA: 100, roomB: 50 },
    });
  });

  it("T26: a failure midway rolls back purpose_settings and purpose_role_pricing together", async () => {
    // teacher is inserted first, then customer breaks purpose_role_pricing_discount.
    const result = await save({
      allowedRoles: ["teacher", "customer"],
      rolePricing: { teacher: { mode: "price", roomA: 0, roomB: 0 }, customer: { mode: "discount", payPercent: 5 } },
    });

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "message", code: "INVALID_ARGUMENT", message: "資料不符合規則，請檢查後再試一次" },
    });
    expect(await yogaRoles()).toBe("{teacher,staff,customer}");
    expect(await yogaPricing()).toEqual([]);
  });

  it("T31 / E09: a second save of the same purpose waits for the first and wins, without hitting the unique key", async () => {
    let releaseFirst!: () => void;
    const firstHolds = new Promise<void>((resolve) => (releaseFirst = resolve));
    let firstWrote!: () => void;
    const firstHasWritten = new Promise<void>((resolve) => (firstWrote = resolve));

    // The first save inserts customer's row and keeps its transaction open.
    const first = save(
      { allowedRoles: ALL_ROLES, rolePricing: { customer: { mode: "price", roomA: 500, roomB: 200 } } },
      "first",
      async () => {
        firstWrote();
        await firstHolds;
      },
    );
    await firstHasWritten;

    // Without the purpose_settings lock the second would also insert customer.
    const second = save({ allowedRoles: ALL_ROLES, rolePricing: { customer: { mode: "discount", payPercent: 80 } } }, "second");
    await vi.waitFor(
      async () => {
        const { rows } = await admin.query<{ waiting: number }>(
          "select count(*)::int as waiting from pg_stat_activity where wait_event_type = 'Lock' and datname = current_database()",
        );
        expect(rows[0].waiting).toBe(1);
      },
      { timeout: 5_000, interval: 50 },
    );
    releaseFirst();

    expect(await first).toEqual({ ok: true, data: null });
    expect(await second).toEqual({ ok: true, data: null });
    expect(await yogaPricing()).toMatchObject([
      { role: "customer", mode: "discount", rate_a: null, rate_b: null, pay_percent: 80, updated_by: "second" },
    ]);
  });

  it("T32 / E08: archiving that commits while a save waits for the row makes the save refuse", async () => {
    const archiver = new Client({ connectionString: TEST_DATABASE_URL });
    await archiver.connect();
    try {
      // Someone archives yoga and hasn't committed yet: they hold its row.
      await archiver.query("begin");
      await archiver.query("update purpose_settings set archived_at = now() where purpose = 'yoga'");

      const saving = save({ allowedRoles: ALL_ROLES, rolePricing: { customer: { mode: "price", roomA: 500, roomB: 200 } } });
      await vi.waitFor(
        async () => {
          const { rows } = await admin.query<{ waiting: number }>(
            "select count(*)::int as waiting from pg_stat_activity where wait_event_type = 'Lock' and datname = current_database()",
          );
          expect(rows[0].waiting).toBe(1);
        },
        { timeout: 5_000, interval: 50 },
      );
      await archiver.query("commit");

      // The save checks archived_at only after it holds the row, so it sees
      // the archive and writes nothing.
      expect(await saving).toMatchObject({
        ok: false,
        error: { kind: "message", code: "FAILED_PRECONDITION", message: "這個用途已停用，啟用後才能編輯" },
      });
      expect(await yogaPricing()).toEqual([]);
    } finally {
      await archiver.query("rollback").catch(() => {});
      await archiver.end();
      await admin.query("update purpose_settings set archived_at = null where purpose = 'yoga'");
    }
  });
});
