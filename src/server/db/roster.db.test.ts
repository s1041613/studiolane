import { describe, expect, it } from "vitest";
import type { Client } from "pg";
import { insertReturningId, rejectionOf, withRollback } from "@/server/db/test-db";

// Roster B1 (docs/settings/shared/04, 人員名單): what an insert from the
// roster settings page relies on. B3 phone and T33 archiving live in
// settings-roster-pricing.db.test.ts (T31 is its "B3" case).

function plan(db: Client, role: "teacher" | "staff", name: string): Promise<string> {
  return insertReturningId(
    db,
    "insert into pricing_plans (role, applies_to, room_a_rate, room_b_rate) values ($1, $2, 500, 250)",
    [role, name],
  );
}

async function customerPlan(db: Client): Promise<string> {
  const { rows } = await db.query<{ id: string }>("select id from pricing_plans where role = 'customer'");
  // There is only ever one customer plan; reuse the seeded one.
  if (rows[0]) return rows[0].id;
  return insertReturningId(
    db,
    "insert into pricing_plans (role, applies_to, room_a_rate, room_b_rate) values ('customer', '測試一般價', 1250, 600)",
  );
}

describe("roster inserts (B1)", () => {
  it("T30 / R07–R09: role and pricing plan are required", async () => {
    await withRollback(async (db) => {
      const teacherPlan = await plan(db, "teacher", "測試老師價");
      expect(await rejectionOf(db, "insert into roster (name, pricing_plan_id) values ('a', $1)", [teacherPlan])).toMatch(
        /null value in column "role"/,
      );
      expect(await rejectionOf(db, "insert into roster (name, role) values ('a', 'teacher')")).toMatch(
        /null value in column "pricing_plan_id"/,
      );
      expect(
        await rejectionOf(db, "insert into roster (name, role, pricing_plan_id) values ('a', 'teacher', $1)", [teacherPlan]),
      ).toBeNull();
    });
  });

  it("T30 / R09: a guest teacher can be put on the customer plan", async () => {
    await withRollback(async (db) => {
      const general = await customerPlan(db);
      expect(
        await rejectionOf(db, "insert into roster (name, role, pricing_plan_id) values ('示範薄荷', 'guest_teacher', $1)", [general]),
      ).toBeNull();
    });
  });

  it("T30 / R08: staff on a staff plan, with updated_by stamped by the app", async () => {
    await withRollback(async (db) => {
      const staffPlan = await plan(db, "staff", "測試櫃檯價");
      const id = await insertReturningId(
        db,
        "insert into roster (name, role, pricing_plan_id, updated_by) values ('小櫃', 'staff', $1, 'demo_staff')",
        [staffPlan],
      );
      const { rows } = await db.query<{ archived_at: Date | null; updated_by: string }>(
        "select archived_at, updated_by from roster where id = $1",
        [id],
      );
      expect(rows[0]).toEqual({ archived_at: null, updated_by: "demo_staff" });
    });
  });
});
