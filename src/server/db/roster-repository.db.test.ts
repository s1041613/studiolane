import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Client } from "pg";
import { press } from "@/server/db/press";
import { TEST_DATABASE_URL } from "@/server/db/test-database-url";
import { RosterRepository } from "@/server/repositories/roster-repository";

// The roster repository against the local database through Drizzle, as the
// actions call it: inside one transaction, committing through the shared
// pool. Rows are created with the postgres connection and removed in
// afterAll. Every fixture is named with
// MARKER, so beforeAll also clears what an interrupted run left behind
// (active plans can't share a name, so a leftover plan would fail setup).

const MARKER = "人員 repo";
const WRITER = { name: "示範櫃檯" };
const MISSING = "00000000-0000-0000-0000-000000000000";

const repo = new RosterRepository();
const admin = new Client({ connectionString: TEST_DATABASE_URL });

async function insertId(query: string, params: unknown[] = []): Promise<string> {
  const { rows } = await admin.query<{ id: string }>(`${query} returning id`, params);
  return rows[0].id;
}

async function insertPerson(name: string, planId: string): Promise<string> {
  return insertId("insert into roster (name, role, pricing_plan_id) values ($1, 'teacher', $2)", [name, planId]);
}

async function removeFixtures(): Promise<void> {
  await admin.query("begin");
  await admin.query("delete from roster where name like $1", [`${MARKER}%`]);
  await admin.query("delete from pricing_plans where applies_to like $1", [`${MARKER}%`]);
  await admin.query("commit");
}

type RosterDbRow = {
  name: string;
  phone: string | null;
  email: string | null;
  instagram: string | null;
  pricing_plan_id: string;
  archived_at: Date | null;
  updated_by: string | null;
};

async function row(id: string): Promise<RosterDbRow> {
  const { rows } = await admin.query<RosterDbRow>(
    "select name, phone, email, instagram, pricing_plan_id, archived_at, updated_by from roster where id = $1",
    [id],
  );
  return rows[0];
}

let teacherPlan = "";
let otherPlan = "";

beforeAll(async () => {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  await admin.connect();
  await removeFixtures();
  teacherPlan = await insertId(
    "insert into pricing_plans (role, applies_to, room_a_rate, room_b_rate) values ('teacher', '人員 repo 測試老師價', 500, 250)",
  );
  otherPlan = await insertId(
    "insert into pricing_plans (role, applies_to, room_a_rate, room_b_rate) values ('teacher', '人員 repo 測試專屬', 450, 200)",
  );
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterAll(async () => {
  await removeFixtures();
  await admin.end();
  vi.restoreAllMocks();
});

describe("RosterRepository reads", () => {
  it("listAll maps the columns the pages use", async () => {
    const id = await insertPerson("人員 repo 讀取", teacherPlan);
    await admin.query("update roster set phone = '0911222333', instagram = 'demo_reader', archived_at = now() where id = $1", [id]);
    const entry = (await repo.listAll()).find((p) => p.id === id);
    expect(entry).toMatchObject({
      name: "人員 repo 讀取",
      email: "",
      phone: "0911222333",
      role: "teacher",
      pricingPlanId: teacherPlan,
      instagram: "demo_reader",
    });
    expect(entry?.archivedAt).toEqual(expect.any(String));
  });
});

describe("RosterRepository writes", () => {
  it("R07: create stores the normalized fields and who added them", async () => {
    let id = "";
    const result = await press(async () => {
      id = await repo.create(
        { name: "人員 repo 示範小藍", role: "teacher", pricingPlanId: teacherPlan, phone: "0912345678", email: "demo.blue@example.com", instagram: "demo_blue" },
        WRITER,
      );
    });
    expect(result).toEqual({ ok: true, data: null });
    expect(await row(id)).toEqual({
      name: "人員 repo 示範小藍",
      phone: "0912345678",
      email: "demo.blue@example.com",
      instagram: "demo_blue",
      pricing_plan_id: teacherPlan,
      archived_at: null,
      updated_by: "示範櫃檯",
    });
  });

  it("R18 / R19: update changes the person and stamps updated_by", async () => {
    const id = await insertPerson("人員 repo 示範小橘", teacherPlan);
    const result = await press(() =>
      repo.update(id, { name: "人員 repo 示範小橘 Orange", pricingPlanId: otherPlan, phone: null, email: null, instagram: null }, WRITER),
    );
    expect(result).toEqual({ ok: true, data: null });
    expect(await row(id)).toMatchObject({ name: "人員 repo 示範小橘 Orange", pricing_plan_id: otherPlan, updated_by: "示範櫃檯" });
  });

  it("R21 / R23 / R24: archive sets archived_at; reactivate clears it and can switch the plan", async () => {
    const id = await insertPerson("人員 repo 示範小鹿", teacherPlan);
    expect(await press(() => repo.archive(id, WRITER))).toEqual({ ok: true, data: null });
    expect((await row(id)).archived_at).toBeInstanceOf(Date);
    expect((await repo.listAll()).find((p) => p.id === id)?.archivedAt).not.toBeNull();

    expect(await press(() => repo.reactivate(id, null, WRITER))).toEqual({ ok: true, data: null });
    expect(await row(id)).toMatchObject({ archived_at: null, pricing_plan_id: teacherPlan });

    await press(() => repo.archive(id, WRITER));
    await press(() => repo.reactivate(id, otherPlan, WRITER));
    expect(await row(id)).toMatchObject({ archived_at: null, pricing_plan_id: otherPlan, updated_by: "示範櫃檯" });
  });

  it("a write to someone who no longer exists is refused and changes nothing", async () => {
    const result = await press(() => repo.archive(MISSING, WRITER));
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "message", code: "FAILED_PRECONDITION", message: "找不到這位人員，或已被停用，請重新整理" },
    });
  });

  it("writes only land on a row still in the state the page saw", async () => {
    const id = await insertPerson("人員 repo 過期頁", teacherPlan);
    // Still active: reactivate (e.g. from a stale page) must not touch it.
    expect(await press(() => repo.reactivate(id, otherPlan, WRITER))).toMatchObject({
      ok: false,
      error: { kind: "message", code: "FAILED_PRECONDITION", message: "找不到這位人員，或已被啟用，請重新整理" },
    });
    expect((await row(id)).pricing_plan_id).toBe(teacherPlan);

    await press(() => repo.archive(id, WRITER));
    // Archived meanwhile: neither a second archive nor an edit goes through.
    expect(await press(() => repo.archive(id, WRITER))).toMatchObject({
      ok: false,
      error: { kind: "message", code: "FAILED_PRECONDITION", message: "找不到這位人員，或已被停用，請重新整理" },
    });
    expect(
      await press(() => repo.update(id, { name: "改名", pricingPlanId: teacherPlan, phone: null, email: null, instagram: null }, WRITER)),
    ).toMatchObject({
      ok: false,
      error: { kind: "message", code: "FAILED_PRECONDITION", message: "找不到這位人員，或已被停用，請重新整理" },
    });
    expect((await row(id)).name).toBe("人員 repo 過期頁");
  });

  it("B3: the DB still rejects a formatted phone; the failure is classified", async () => {
    const result = await press(() =>
      repo.create({ name: "人員 repo 錯號", role: "teacher", pricingPlanId: teacherPlan, phone: "0912-345-678", email: null, instagram: null }, WRITER), // gitleaks:allow
    );
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "message", code: "INVALID_ARGUMENT", message: "資料不符合規則，請檢查後再試一次" },
    });
    const { rows } = await admin.query("select 1 from roster where name = '人員 repo 錯號'");
    expect(rows).toEqual([]);
  });
});
