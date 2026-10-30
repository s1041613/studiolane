import { describe, expect, it } from "vitest";
import { rejectionOf, withRollback } from "@/server/db/test-db";

// 價格方案 T24 (P05). T22, T23, T26, T27 are in settings-roster-pricing.db.test.ts.

describe("pricing plans: one customer plan (0005, still in force after 0013)", () => {
  it("T24: a second customer plan is rejected", async () => {
    await withRollback(async (db) => {
      const { rows } = await db.query<{ count: string }>("select count(*) from pricing_plans where role = 'customer'");
      if (rows[0].count === "0") {
        await db.query("insert into pricing_plans (role, applies_to, room_a_rate, room_b_rate) values ('customer', '一般價', 1250, 600)");
      }
      expect(
        await rejectionOf(
          db,
          "insert into pricing_plans (role, applies_to, room_a_rate, room_b_rate) values ('customer', '第二個客戶價', 1250, 600)",
        ),
      ).toMatch(/pricing_plans_one_customer/);
    });
  });
});
