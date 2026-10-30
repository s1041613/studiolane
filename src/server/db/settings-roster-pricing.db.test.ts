import { describe, expect, it } from "vitest";
import type { Client } from "pg";
import { insertReturningId, rejectionOf, withRollback } from "@/server/db/test-db";

// 0012 (roster) and 0013 (pricing_plans) rules from docs/settings/shared/04.
// Roster T33; pricing T22, T26.

function teacherPlan(db: Client, name: string): Promise<string> {
  return insertReturningId(
    db,
    "insert into pricing_plans (role, applies_to, room_a_rate, room_b_rate) values ('teacher', $1, 500, 250)",
    [name],
  );
}

function person(db: Client, planId: string, phone: string | null = null): Promise<string> {
  return insertReturningId(db, "insert into roster (name, role, pricing_plan_id, phone) values ('測試老師', 'teacher', $1, $2)", [
    planId,
    phone,
  ]);
}

describe("roster settings (0012)", () => {
  it("B3: phone is stored as a Taiwan mobile number, digits only", async () => {
    await withRollback(async (db) => {
      const plan = await teacherPlan(db, "測試方案");
      expect(await rejectionOf(db, "insert into roster (name, role, pricing_plan_id, phone) values ('a', 'teacher', $1, '0912-345-678')", [plan])).toMatch( // gitleaks:allow
        /roster_phone_mobile/,
      );
      expect(await rejectionOf(db, "insert into roster (name, role, pricing_plan_id, phone) values ('a', 'teacher', $1, '0212345678')", [plan])).toMatch(
        /roster_phone_mobile/,
      );
      expect(await rejectionOf(db, "insert into roster (name, role, pricing_plan_id, phone) values ('a', 'teacher', $1, '0912345678')", [plan])).toBeNull();
      expect(await rejectionOf(db, "insert into roster (name, role, pricing_plan_id, phone) values ('a', 'teacher', $1, null)", [plan])).toBeNull();
    });
  });

  it("T33: archived_at can be set and cleared on someone with history", async () => {
    await withRollback(async (db) => {
      const id = await person(db, await teacherPlan(db, "測試方案"));
      await db.query(
        `insert into rentals (room, starts_at, ends_at, renter_id, renter_type, renter_name, purpose, status, payment_state, payment_method, amount)
         values ('A', '2031-03-03 18:00+08', '2031-03-03 19:00+08', $1, 'roster', '測試老師', 'dance', 'registered', 'unpaid', 'on_site', 500)`,
        [id],
      );
      expect(await rejectionOf(db, "update roster set archived_at = now() where id = $1", [id])).toBeNull();
      expect(await rejectionOf(db, "update roster set archived_at = null where id = $1", [id])).toBeNull();
    });
  });

  it("stamps updated_at and keeps updated_by on every update", async () => {
    await withRollback(async (db) => {
      const id = await person(db, await teacherPlan(db, "測試方案"));
      await db.query("update roster set updated_at = '2000-01-01' where id = $1", [id]);
      await db.query("update roster set name = '改名', updated_by = 'demo_staff' where id = $1", [id]);
      const { rows } = await db.query<{ updated_at: Date; updated_by: string }>(
        "select updated_at, updated_by from roster where id = $1",
        [id],
      );
      expect(rows[0].updated_at.getFullYear()).toBeGreaterThan(2000);
      expect(rows[0].updated_by).toBe("demo_staff");
    });
  });
});

describe("pricing settings (0013)", () => {
  it("B2: a plan needs a name", async () => {
    await withRollback(async (db) => {
      expect(
        await rejectionOf(db, "insert into pricing_plans (role, room_a_rate, room_b_rate) values ('teacher', 500, 250)"),
      ).toMatch(/applies_to/);
    });
  });

  it("T22: active plans can't share a name; an archived one can", async () => {
    await withRollback(async (db) => {
      const first = await teacherPlan(db, "測試方案");
      expect(
        await rejectionOf(
          db,
          "insert into pricing_plans (role, applies_to, room_a_rate, room_b_rate) values ('staff', ' 測試方案 ', 600, 250)",
        ),
      ).toMatch(/pricing_plans_active_name/);
      await db.query("update pricing_plans set archived_at = now() where id = $1", [first]);
      expect(
        await rejectionOf(
          db,
          "insert into pricing_plans (role, applies_to, room_a_rate, room_b_rate) values ('teacher', '測試方案', 900, 400)",
        ),
      ).toBeNull();
    });
  });

  it("B3: hourly rates top out at 99,999", async () => {
    await withRollback(async (db) => {
      expect(
        await rejectionOf(
          db,
          "insert into pricing_plans (role, applies_to, room_a_rate, room_b_rate) values ('teacher', '測試方案', 100000, 250)",
        ),
      ).toMatch(/pricing_plans_rates_upper/);
      expect(
        await rejectionOf(
          db,
          "insert into pricing_plans (role, applies_to, room_a_rate, room_b_rate) values ('teacher', '測試方案', 99999, 99999)",
        ),
      ).toBeNull();
    });
  });

  it("T26: the customer plan can't be archived", async () => {
    await withRollback(async (db) => {
      const { rows } = await db.query<{ id: string }>("select id from pricing_plans where role = 'customer'");
      const customer =
        rows[0]?.id ??
        (await insertReturningId(
          db,
          "insert into pricing_plans (role, applies_to, room_a_rate, room_b_rate) values ('customer', '一般價', 1250, 600)",
        ));
      expect(await rejectionOf(db, "update pricing_plans set archived_at = now() where id = $1", [customer])).toMatch(
        /pricing_plans_customer_active/,
      );
    });
  });

  it("stamps updated_at on every update", async () => {
    await withRollback(async (db) => {
      const id = await teacherPlan(db, "測試方案");
      await db.query("update pricing_plans set updated_at = '2000-01-01' where id = $1", [id]);
      await db.query("update pricing_plans set room_a_rate = 900, updated_by = 'demo_staff' where id = $1", [id]);
      const { rows } = await db.query<{ updated_at: Date; updated_by: string }>(
        "select updated_at, updated_by from pricing_plans where id = $1",
        [id],
      );
      expect(rows[0].updated_at.getFullYear()).toBeGreaterThan(2000);
      expect(rows[0].updated_by).toBe("demo_staff");
    });
  });
});

describe("delete is revoked (roster B7, pricing B8)", () => {
  it("service_role can no longer delete people or plans", async () => {
    await withRollback(async (db) => {
      const { rows } = await db.query<{ table_name: string }>(
        `select table_name from information_schema.role_table_grants
         where grantee = 'service_role' and privilege_type = 'DELETE' and table_name in ('roster', 'pricing_plans')`,
      );
      expect(rows).toEqual([]);
    });
  });
});
