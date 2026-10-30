import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { Client } from "pg";
import { failFields } from "@/lib/result";
import { getDb } from "@/server/db/client";
import { press } from "@/server/db/press";
import { TEST_DATABASE_URL } from "@/server/db/test-database-url";
import { pricingPlans } from "@/server/drizzle/schema/pricing";
import {
  CUSTOMER_PLAN_ARCHIVE_ERROR,
  CUSTOMER_PLAN_TAKEN,
  REACTIVATE_NAME_TAKEN,
  sameNameError,
} from "@/server/logic/pricing-form";
import { PricingRepository } from "@/server/repositories/pricing-repository";

// The real repository against the local database through the getDb() pool,
// committing like an action would. Every plan's name starts with MARKER;
// afterAll removes them as postgres (the app role can't delete plans, B8).

const MARKER = "價格測試";
const WRITER = "示範櫃檯";
const ERROR_ID = expect.any(String);

const repo = new PricingRepository();
let admin: Client;

function plan(name: string) {
  return { role: "teacher" as const, name: `${MARKER} ${name}`, roomARate: 500, roomBRate: 250, updatedBy: WRITER };
}

async function rowOf(id: string) {
  const [row] = await getDb().select().from(pricingPlans).where(eq(pricingPlans.id, id));
  return row;
}

beforeAll(async () => {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  admin = new Client({ connectionString: TEST_DATABASE_URL });
  await admin.connect();
  await admin.query("delete from pricing_plans where applies_to like $1", [`${MARKER}%`]);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterAll(async () => {
  await admin.query("delete from pricing_plans where applies_to like $1", [`${MARKER}%`]);
  await admin.end();
  vi.restoreAllMocks();
});

describe("PricingRepository", () => {
  it("creates a plan and reads every field back", async () => {
    const id = await repo.create({ ...plan("新增"), roomARate: 1800, roomBRate: 330 });

    const found = (await repo.listAll()).find((p) => p.id === id);
    expect(found).toEqual({
      id,
      category: "teacher",
      appliesTo: `${MARKER} 新增`,
      roomARate: 1800,
      roomBRate: 330,
      archivedAt: null,
    });
    expect((await rowOf(id)).updatedBy).toBe(WRITER);
  });

  it("update writes the plan and who changed it", async () => {
    const id = await repo.create(plan("調價"));
    const result = await press(() =>
      repo.update(id, { name: `${MARKER} 調價後`, roomARate: 900, roomBRate: 250, updatedBy: "櫃檯" }),
    );

    expect(result).toEqual({ ok: true, data: null });
    expect(await rowOf(id)).toMatchObject({ appliesTo: `${MARKER} 調價後`, roomARate: 900, updatedBy: "櫃檯" });
  });

  it("archives and reactivates a plan", async () => {
    const id = await repo.create(plan("停用"));
    expect(await press(() => repo.setArchived(id, true, "櫃檯"))).toEqual({ ok: true, data: null });
    expect((await rowOf(id)).archivedAt).not.toBeNull();

    expect(await press(() => repo.setArchived(id, false, "櫃檯"))).toEqual({ ok: true, data: null });
    expect((await rowOf(id)).archivedAt).toBeNull();
  });

  it("refuses a plan that is gone", async () => {
    const missing = "00000000-0000-0000-0000-000000000000";
    const result = await press(() => repo.setArchived(missing, true, "櫃檯"));

    expect(result).toEqual({
      ok: false,
      error: { kind: "message", code: "NOT_FOUND", message: "找不到這個方案，請重新整理", errorId: ERROR_ID },
    });
  });

  it("reactivating to a name taken by an active plan refuses as ALREADY_EXISTS, rolling back with no change", async () => {
    const archived = await repo.create(plan("同名"));
    await press(() => repo.setArchived(archived, true, "櫃檯"));
    await repo.create(plan("同名"));

    // Violates pricing_plans_active_name on reactivate.
    const result = await press(() => repo.setArchived(archived, false, "櫃檯"));

    expect(result).toEqual({
      ok: false,
      error: { kind: "message", code: "ALREADY_EXISTS", message: REACTIVATE_NAME_TAKEN, errorId: ERROR_ID },
    });
    expect((await rowOf(archived)).archivedAt).not.toBeNull();
  });

  it("a concurrent duplicate active name on create refuses as fields.name = sameNameError(name)", async () => {
    const name = `${MARKER} 搶先`;
    await repo.create({ role: "teacher", name, roomARate: 500, roomBRate: 250, updatedBy: WRITER });

    const result = await press(() =>
      repo.create({ role: "teacher", name, roomARate: 900, roomBRate: 220, updatedBy: WRITER }),
    );

    expect(result).toEqual({
      ok: false,
      error: { ...failFields({ name: sameNameError(name) }).error, errorId: ERROR_ID },
    });
  });

  it("a second customer plan on create refuses as fields.role = CUSTOMER_PLAN_TAKEN", async () => {
    const result = await press(() => repo.create({ ...plan("顧客2"), role: "customer" }));

    expect(result).toEqual({
      ok: false,
      error: { ...failFields({ role: CUSTOMER_PLAN_TAKEN }).error, errorId: ERROR_ID },
    });
  });

  it("update to a taken active name refuses as fields.name = sameNameError(name), with no change", async () => {
    await repo.create(plan("已存在"));
    const id = await repo.create(plan("改名"));

    const result = await press(() =>
      repo.update(id, { name: `${MARKER} 已存在`, roomARate: 900, roomBRate: 250, updatedBy: "櫃檯" }),
    );

    expect(result).toEqual({
      ok: false,
      error: { ...failFields({ name: sameNameError(`${MARKER} 已存在`) }).error, errorId: ERROR_ID },
    });
    expect(await rowOf(id)).toMatchObject({ appliesTo: `${MARKER} 改名` });
  });

  it("refuses to archive the customer plan as FAILED_PRECONDITION, with no change", async () => {
    const customerPlan = (await repo.listAll()).find((p) => p.category === "customer" && p.archivedAt === null);
    if (!customerPlan) throw new Error("expected an active customer plan in the seed data");

    const result = await press(() => repo.setArchived(customerPlan.id, true, "櫃檯"));

    expect(result).toEqual({
      ok: false,
      error: { kind: "message", code: "FAILED_PRECONDITION", message: CUSTOMER_PLAN_ARCHIVE_ERROR, errorId: ERROR_ID },
    });
    expect((await rowOf(customerPlan.id)).archivedAt).toBeNull();
  });

  it("a failed read says which list could not be read, in words a person can act on", async () => {
    // Outside a transaction listAll reads through the shared getDb(); break its next query.
    const spy = vi.spyOn(getDb(), "select").mockImplementationOnce(() => {
      throw Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
    });
    await expect(repo.listAll()).rejects.toThrow("讀取價格方案失敗：資料庫暫時連不上，請稍後再試一次");
    spy.mockRestore();
  });
});
