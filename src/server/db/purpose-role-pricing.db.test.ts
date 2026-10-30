import { describe, expect, it } from "vitest";
import { rejectionOf, withRollback } from "@/server/db/test-db";

// purpose_role_pricing rules from docs/e-5-purpose-role-pricing/04-db-design.html
// (B1–B5). E-5 T24, T25.

const INSERT = "insert into purpose_role_pricing (purpose, role, mode, rate_a, rate_b, pay_percent) values ($1, $2, $3, $4, $5, $6)";

describe("purpose_role_pricing", () => {
  it("T24 / B2: price needs both rates in 0..99999 and no pay_percent", async () => {
    await withRollback(async (db) => {
      const price = (a: number | null, b: number | null, payPercent: number | null = null) =>
        rejectionOf(db, INSERT, ["yoga", "customer", "price", a, b, payPercent]);
      expect(await price(500, null)).toMatch(/purpose_role_pricing_price/);
      expect(await price(null, 220)).toMatch(/purpose_role_pricing_price/);
      expect(await price(null, null)).toMatch(/purpose_role_pricing_price/);
      expect(await price(-1, 0)).toMatch(/purpose_role_pricing_price/);
      expect(await price(0, 100000)).toMatch(/purpose_role_pricing_price/);
      expect(await price(500, 200, 80)).toMatch(/purpose_role_pricing_price/);
      expect(await price(0, 99999)).toBeNull();
    });
  });

  it("T24 / B3: discount needs pay_percent in 10..99 and no rates", async () => {
    await withRollback(async (db) => {
      const discount = (payPercent: number | null, a: number | null = null, b: number | null = null) =>
        rejectionOf(db, INSERT, ["yoga", "customer", "discount", a, b, payPercent]);
      expect(await discount(null)).toMatch(/purpose_role_pricing_discount/);
      expect(await discount(9)).toMatch(/purpose_role_pricing_discount/);
      expect(await discount(100)).toMatch(/purpose_role_pricing_discount/);
      expect(await discount(80, 500, 200)).toMatch(/purpose_role_pricing_discount/);
      expect(await discount(80, null, 220)).toMatch(/purpose_role_pricing_discount/);
      expect(await discount(10)).toBeNull();
    });
  });

  it("T24 / B1: one row per purpose and role, only teacher/staff/customer, purpose must exist", async () => {
    await withRollback(async (db) => {
      expect(await rejectionOf(db, INSERT, ["yoga", "teacher", "discount", null, null, 80])).toBeNull();
      expect(await rejectionOf(db, INSERT, ["yoga", "teacher", "price", 0, 0, null])).toMatch(
        /purpose_role_pricing_purpose_role/,
      );
      expect(await rejectionOf(db, INSERT, ["yoga", "guest_teacher", "discount", null, null, 80])).toMatch(
        /purpose_role_pricing_role/,
      );
      expect(await rejectionOf(db, INSERT, ["yoga", "x", "discount", null, null, 80])).toMatch(/invalid input value/);
      expect(await rejectionOf(db, INSERT, ["yoga", "staff", "plan", null, null, null])).toMatch(/invalid input value/);
    });
  });

  it("T25: the seed's role pricing reads back; the old columns are gone", async () => {
    await withRollback(async (db) => {
      const { rows } = await db.query(
        "select purpose::text, role::text, mode::text, rate_a, rate_b, pay_percent from purpose_role_pricing order by purpose::text, role",
      );
      expect(rows).toEqual([
        { purpose: "performance", role: "teacher", mode: "price", rate_a: 100, rate_b: 100, pay_percent: null },
        { purpose: "photography", role: "customer", mode: "price", rate_a: 800, rate_b: 500, pay_percent: null },
        { purpose: "workshop", role: "teacher", mode: "discount", rate_a: null, rate_b: null, pay_percent: 50 },
      ]);
      const columns = await db.query(
        "select column_name from information_schema.columns where table_name = 'purpose_settings' and column_name like 'special_rate%'",
      );
      expect(columns.rows).toEqual([]);
      const checks = await db.query(
        "select conname from pg_constraint where conname = 'purpose_settings_special_rates'",
      );
      expect(checks.rows).toEqual([]);
    });
  });

  it("the app's role can read, insert, update and delete; anon and authenticated get nothing", async () => {
    await withRollback(async (db) => {
      await db.query("set local role service_role");
      expect(await rejectionOf(db, INSERT, ["yoga", "customer", "discount", null, null, 80])).toBeNull();
      expect(await rejectionOf(db, "select * from purpose_role_pricing")).toBeNull();
      expect(await rejectionOf(db, "update purpose_role_pricing set pay_percent = 85 where purpose = 'yoga'")).toBeNull();
      expect(await rejectionOf(db, "delete from purpose_role_pricing where purpose = 'yoga'")).toBeNull();
      expect(await rejectionOf(db, "truncate purpose_role_pricing")).toMatch(/permission denied/);
      for (const role of ["anon", "authenticated"]) {
        await db.query(`set local role ${role}`);
        expect(await rejectionOf(db, "select * from purpose_role_pricing")).toMatch(/permission denied/);
      }
    });
  });

  it("stamps updated_at and keeps updated_by on every update", async () => {
    await withRollback(async (db) => {
      await db.query(
        "update purpose_role_pricing set updated_at = '2000-01-01' where purpose = 'performance' and role = 'teacher'",
      );
      await db.query(
        "update purpose_role_pricing set rate_a = 100, updated_by = 'demo_staff' where purpose = 'performance' and role = 'teacher'",
      );
      const { rows } = await db.query<{ updated_at: Date; updated_by: string }>(
        "select updated_at, updated_by from purpose_role_pricing where purpose = 'performance' and role = 'teacher'",
      );
      expect(rows[0].updated_at.getFullYear()).toBeGreaterThan(2000);
      expect(rows[0].updated_by).toBe("demo_staff");
    });
  });
});
