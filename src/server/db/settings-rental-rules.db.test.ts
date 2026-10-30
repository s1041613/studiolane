import { describe, expect, it } from "vitest";
import type { Client } from "pg";
import { insertReturningId, rejectionOf, withRollback } from "@/server/db/test-db";

// rental_rules rules from docs/settings/shared/04-db-design.html, 租借時段.
// Rental rules T22–T24.

// 2031-03-03 is a Monday (isodow 1).
const MONDAY = "2031-03-03";

function insertRule(db: Client, values: string): Promise<string | null> {
  return rejectionOf(db, `insert into rental_rules (room, weekday, on_date, start_time, end_time, effect, reason) values ${values}`);
}

describe("rental rules settings (0015)", () => {
  it("T24: a weekly row defaults to block and starts active", async () => {
    await withRollback(async (db) => {
      const id = await insertReturningId(
        db,
        "insert into rental_rules (room, weekday, start_time, end_time, reason) values ('A', 1, '17:30', '22:30', '營業時段')",
      );
      const { rows } = await db.query<{ effect: string; on_date: string | null; archived_at: Date | null }>(
        "select effect, on_date, archived_at from rental_rules where id = $1",
        [id],
      );
      expect(rows[0]).toEqual({ effect: "block", on_date: null, archived_at: null });
    });
  });

  it("T22 / B2: an exception that opens time needs a date", async () => {
    await withRollback(async (db) => {
      expect(await insertRule(db, "('A', 1, null, '13:30', '22:30', 'open', '成發停課')")).toMatch(/rental_rules_open_needs_date/);
      expect(await insertRule(db, `('A', 1, '${MONDAY}', '13:30', '22:30', 'open', '成發停課')`)).toBeNull();
    });
  });

  it("T22 / B3: the date falls on the row's weekday", async () => {
    await withRollback(async (db) => {
      expect(await insertRule(db, `('A', 2, '${MONDAY}', '12:00', '14:00', 'block', '臨時封教室')`)).toMatch(
        /rental_rules_on_date_weekday/,
      );
      expect(await insertRule(db, `('BOTH', 1, '${MONDAY}', '12:00', '14:00', 'block', '臨時封教室')`)).toBeNull();
    });
  });

  it("T22 / B3: the end is later than the start; 24:00 is the end of the day", async () => {
    await withRollback(async (db) => {
      expect(await insertRule(db, "('A', 1, null, '13:30', '13:00', 'block', '營業時段')")).toMatch(/rental_rules_ends_after_starts/);
      expect(await insertRule(db, "('A', 1, null, '13:30', '13:30', 'block', '營業時段')")).toMatch(/rental_rules_ends_after_starts/);
      expect(await insertRule(db, "('A', 1, null, '22:30', '24:00', 'block', '打烊')")).toBeNull();
    });
  });

  it("T22 / B3: the reason is 1–30 characters after trimming", async () => {
    await withRollback(async (db) => {
      expect(await insertRule(db, "('A', 1, null, '13:30', '14:00', 'block', '   ')")).toMatch(/rental_rules_reason_length/);
      expect(await insertRule(db, `('A', 1, null, '13:30', '14:00', 'block', '${"長".repeat(31)}')`)).toMatch(
        /rental_rules_reason_length/,
      );
      expect(await insertRule(db, `('A', 1, null, '13:30', '14:00', 'block', '${"長".repeat(30)}')`)).toBeNull();
    });
  });

  it("stamps updated_at and keeps updated_by on every update", async () => {
    await withRollback(async (db) => {
      const id = await insertReturningId(
        db,
        "insert into rental_rules (room, weekday, start_time, end_time, reason) values ('A', 1, '17:30', '22:30', '營業時段')",
      );
      await db.query("update rental_rules set updated_at = '2000-01-01' where id = $1", [id]);
      await db.query("update rental_rules set archived_at = now(), updated_by = 'demo_staff' where id = $1", [id]);
      const { rows } = await db.query<{ updated_at: Date; updated_by: string }>(
        "select updated_at, updated_by from rental_rules where id = $1",
        [id],
      );
      expect(rows[0].updated_at.getFullYear()).toBeGreaterThan(2000);
      expect(rows[0].updated_by).toBe("demo_staff");
    });
  });

  it("T23 / B7: the app's role can't delete rules", async () => {
    await withRollback(async (db) => {
      await db.query("set local role service_role");
      expect(await rejectionOf(db, "delete from rental_rules")).toMatch(/permission denied/);
    });
  });
});
