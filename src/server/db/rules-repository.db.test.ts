import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Client } from "pg";
import { press } from "@/server/db/press";
import { TEST_DATABASE_URL } from "@/server/db/test-database-url";
import type { RuleInput } from "@/server/logic/booking-rules";

// Rental rules T21: the real repository against the local database, so
// column names and time parsing are checked end to end. Writes commit like
// an action's would, so every row is tagged with a reason prefix and removed
// afterwards.
process.env.DATABASE_URL = TEST_DATABASE_URL;

const { RulesRepository } = await import("@/server/repositories/rules-repository");

const TAG = "T21測試";
const WRITER = "示範櫃檯";
const repo = new RulesRepository();
let admin: Client;

function weekly(weekday: number, start: string, end: string, reason: string): RuleInput {
  return { kind: "rental", room: "A", weekday, onDate: null, start, end, effect: "block", reason: `${TAG} ${reason}` };
}

beforeAll(async () => {
  admin = new Client({ connectionString: TEST_DATABASE_URL });
  await admin.connect();
  await admin.query("delete from rental_rules where reason like $1", [`${TAG}%`]);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterAll(async () => {
  await admin.query("delete from rental_rules where reason like $1", [`${TAG}%`]);
  await admin.end();
  vi.restoreAllMocks();
});

describe("RulesRepository", () => {
  it("T21: one row per rule — weekdays of the same rule stay separate rows", async () => {
    const created = await repo.create([1, 2].map((weekday) => weekly(weekday, "17:30", "22:30", "晚上保養")), WRITER);
    expect(created).toHaveLength(2);

    const mine = (await repo.listAll()).filter((r) => r.reason === `${TAG} 晚上保養`);
    expect(mine.map((r) => r.weekday).sort()).toEqual([1, 2]);
    expect(new Set(mine.map((r) => r.id)).size).toBe(2);
    expect(mine.every((r) => r.kind === "rental")).toBe(true);
  });

  it("T21: reads on_date, effect, archived_at, BOTH and 24:00", async () => {
    const [open] = await repo.create(
      [{ kind: "rental", room: null, weekday: 7, onDate: "2031-12-14", start: "13:30", end: "24:00", effect: "open", reason: `${TAG} 開放` }],
      WRITER,
    );
    expect(open).toMatchObject({ room: null, weekday: 7, onDate: "2031-12-14", start: "13:30", end: "24:00", effect: "open", archivedAt: null });

    const { rows } = await admin.query<{ updated_by: string }>("select updated_by from rental_rules where id = $1", [open.id]);
    expect(rows[0].updated_by).toBe(WRITER);
  });

  it("I-02: a batch with one bad row inserts none of them", async () => {
    await expect(
      repo.create([weekly(3, "06:00", "08:00", "整批"), weekly(4, "08:00", "06:00", "整批")], WRITER),
    ).rejects.toThrow();
    expect((await repo.listAll()).filter((r) => r.reason === `${TAG} 整批`)).toHaveLength(0);
  });

  it("T10 / T11: update and archive touch only that row", async () => {
    const [monday, tuesday] = await repo.create([1, 2].map((weekday) => weekly(weekday, "06:00", "13:30", "平日白天")), WRITER);

    let updated: unknown;
    expect(
      await press(async () => {
        updated = await repo.update(monday.id, { ...monday, start: "07:00" }, "櫃檯");
      }),
    ).toEqual({ ok: true, data: null });
    expect(updated).toMatchObject({ id: monday.id, start: "07:00" });

    let archivedAt: string | null = null;
    await press(async () => {
      archivedAt = (await repo.setArchived(monday.id, new Date().toISOString(), "櫃檯")).archivedAt;
    });
    expect(archivedAt).not.toBeNull();

    let reactivated: string | null = "unset";
    await press(async () => {
      reactivated = (await repo.setArchived(monday.id, null, "櫃檯")).archivedAt;
    });
    expect(reactivated).toBeNull();

    const untouched = (await repo.listAll()).find((r) => r.id === tuesday.id);
    expect(untouched).toMatchObject({ start: "06:00", archivedAt: null });

    const { rows } = await admin.query<{ updated_by: string }>("select updated_by from rental_rules where id = $1", [monday.id]);
    expect(rows[0].updated_by).toBe("櫃檯");
  });

  it("a failed update rolls back and comes back as a classified failure", async () => {
    const [rule] = await repo.create([weekly(5, "06:00", "08:00", "失敗")], WRITER);

    // Violates rental_rules_ends_after_starts.
    const result = await press(() => repo.update(rule.id, { ...rule, end: "05:00" }, "櫃檯"));

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "message", code: "INVALID_ARGUMENT", message: "資料不符合規則，請檢查後再試一次" },
    });
    expect((await repo.listAll()).find((r) => r.id === rule.id)).toMatchObject({ end: "08:00" });
  });

  it("a row that is gone is refused with the not-found message", async () => {
    const missing = "00000000-0000-0000-0000-000000000000";
    const result = await press(() => repo.setArchived(missing, new Date().toISOString(), "櫃檯"));

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "message", code: "NOT_FOUND", message: "找不到這筆租借時段，請重新整理" },
    });
  });
});
