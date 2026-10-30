import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import type { Client as PgClient } from "pg";
import { rejectionOf, withRollback } from "@/server/db/test-db";
import { getAvailableWindows } from "@/server/logic/booking-rules";
import type { RentalRule } from "@/server/logic/booking-rules";
import { schedulingRangeOn } from "@/server/logic/scheduling-range";
import { addDays, isoWeekday } from "@/server/logic/date";

// docs/rental-time-rules/04-db-design: migration 0019 (rental_rules.kind).

function insertRule(db: PgClient, values: string): Promise<string | null> {
  return rejectionOf(db, `insert into rental_rules (kind, room, weekday, on_date, start_time, end_time, effect, reason) values ${values}`);
}

describe("rental_rules.kind constraints (0019)", () => {
  it("a new row is a 租借規則 unless it says otherwise", async () => {
    await withRollback(async (db) => {
      const { rows } = await db.query<{ kind: string }>(
        "insert into rental_rules (room, weekday, start_time, end_time, reason) values ('A', 1, '06:00', '08:00', 'x') returning kind",
      );
      expect(rows[0].kind).toBe("rental");
    });
  });

  it("AC22: a weekly 可租 is refused", async () => {
    await withRollback(async (db) => {
      expect(await insertRule(db, "('rental', 'A', 1, null, '10:00', '12:00', 'open', 'x')")).toMatch(/rental_rules_open_needs_date/);
    });
  });

  it("AC23: a 上課時段 is never 可租", async () => {
    await withRollback(async (db) => {
      expect(await insertRule(db, "('class_hours', 'A', 6, '2031-03-08', '09:00', '12:00', 'open', '上課時段')")).toMatch(
        /rental_rules_class_hours_block/,
      );
    });
  });

  it("a 上課時段 always reads 上課時段", async () => {
    await withRollback(async (db) => {
      expect(await insertRule(db, "('class_hours', 'A', 1, null, '17:30', '22:30', 'block', '營業時段')")).toMatch(
        /rental_rules_class_hours_reason/,
      );
      expect(await insertRule(db, "('class_hours', 'A', 1, null, '17:30', '22:30', 'block', '上課時段')")).toBeNull();
    });
  });
});

// AC33 / 閘門 3: the seed's rules, read as 上課時段 and as the plain weekly
// blocks named 營業時段 they used to be. 可以租 must not change on any day; 可以排課 loses only 平日白天,
// which was never class time (decision D2).
type SeedRuleRow = {
  id: string;
  kind: RentalRule["kind"];
  room: "A" | "B" | "BOTH";
  weekday: number;
  on_date: string | null;
  start_time: string;
  end_time: string;
  effect: RentalRule["effect"];
  reason: string;
  archived_at: string | null;
};

// The seed's own rental_rules inserts, so this doesn't depend on whatever
// rules the shared local DB holds right now.
function seedRentalRuleInserts(): string[] {
  const sql = readFileSync(new URL("../../../supabase/seed.sql", import.meta.url), "utf8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
  return sql
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.startsWith("insert into rental_rules"));
}

async function seededRules(): Promise<RentalRule[]> {
  let rows: SeedRuleRow[] = [];
  await withRollback(async (db) => {
    await db.query("delete from rental_rules");
    for (const statement of seedRentalRuleInserts()) await db.query(statement);
    ({ rows } = await db.query<SeedRuleRow>(
      "select id, kind, room, weekday, on_date::text, start_time::text, end_time::text, effect, reason, archived_at::text from rental_rules",
    ));
  });
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    room: row.room === "BOTH" ? null : row.room,
    weekday: row.weekday,
    onDate: row.on_date,
    start: row.start_time.slice(0, 5),
    end: row.end_time.slice(0, 5),
    effect: row.effect,
    reason: row.reason,
    archivedAt: row.archived_at,
  }));
}

describe("AC33: converting the seed keeps every day's rentable time", () => {
  let after: RentalRule[] = [];

  beforeAll(async () => {
    after = (await seededRules()).filter((r) => r.archivedAt === null);
  });

  it("the seed has 上課時段 rows", () => {
    const classHours = after.filter((r) => r.kind === "class_hours");
    expect(classHours.length).toBeGreaterThan(0);
    expect(classHours.every((r) => r.reason === "上課時段" && r.effect === "block")).toBe(true);
  });

  it("可以租 is the same on every day for six months, in both rooms; 可以排課 only loses 平日白天", () => {
    const before: RentalRule[] = after.map((r) => (r.kind === "class_hours" ? { ...r, kind: "rental", reason: "營業時段" } : r));
    const beforeRange = (date: string) =>
      // The old range: room A's own weekly blocks, 平日白天 included.
      schedulingRangeOn(date, before.map((r) => (r.room === "A" && r.effect === "block" && r.onDate === null ? { ...r, kind: "class_hours" } : r)));
    const mornings = after.filter((r) => r.reason.startsWith("平日白天"));

    let date = "2026-10-01";
    for (let i = 0; i < 183; i++, date = addDays(date, 1)) {
      for (const room of ["A", "B"] as const) {
        expect(getAvailableWindows(room, date, { rules: after, existingRentals: [] }), `${room} ${date}`).toEqual(
          getAvailableWindows(room, date, { rules: before, existingRentals: [] }),
        );
      }
      // Minute by minute (10-minute steps): whatever left the range was 平日白天 that weekday.
      const inside = (windows: { start: string; end: string }[], m: string) => windows.some((w) => w.start <= m && m < w.end);
      const nowRange = schedulingRangeOn(date, after);
      const weekdayMornings = mornings.filter((r) => r.onDate === null && r.weekday === isoWeekday(date));
      for (let min = 0; min < 1440; min += 10) {
        const m = `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
        if (inside(beforeRange(date), m) && !inside(nowRange, m)) {
          expect(inside(weekdayMornings, m), `${date} ${m} left the range but isn't 平日白天`).toBe(true);
        }
      }
    }
  });
});
