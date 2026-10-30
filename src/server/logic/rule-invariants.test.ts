import { describe, expect, it } from "vitest";
import { getAvailableWindows, minutesToHHmm, toMinutes } from "@/server/logic/booking-rules";
import type { RentalRule } from "@/server/logic/booking-rules";
import { schedulingRangeOn } from "@/server/logic/scheduling-range";
import { isoWeekday } from "@/server/logic/date";
import { makeRental } from "@/server/logic/test-fixtures";
import { RentalStatus } from "@/server/types/home";
import type { RentalSummary } from "@/server/types/home";

// docs/rental-time-rules/03-tdd 閘門 4: the user's three conditions hold for
// any mix of rules and bookings, not only the hand-picked examples. A fixed
// seed keeps every run identical; a failure prints the case to reproduce it.
//   ① rentable time never touches a registered booking
//   ② rentable time never touches that day's 不可租 (e.g. maintenance)
//   ③ rentable time never touches 上課時段, except a weekly one that day's 可租 lifts
//   and the scheduling range is made of 上課時段 only.

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const DATES = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"];

type Range = [number, number];

function overlaps([a, b]: Range, [c, d]: Range): boolean {
  return a < d && c < b;
}

function span(rule: { start: string; end: string }): Range {
  return [toMinutes(rule.start), toMinutes(rule.end)];
}

function randomCase(next: () => number) {
  const pick = <T,>(items: readonly T[]) => items[Math.floor(next() * items.length)];
  const range = (): [string, string] => {
    const start = Math.floor(next() * 40) * 30; // 00:00–19:30
    const end = Math.min(1440, start + 30 + Math.floor(next() * 12) * 30);
    return [minutesToHHmm(start), minutesToHHmm(end)];
  };
  const rules: RentalRule[] = [];
  const count = 2 + Math.floor(next() * 8);
  for (let i = 0; i < count; i++) {
    const [start, end] = range();
    const dated = next() < 0.5;
    const onDate = dated ? pick(DATES) : null;
    const weekday = onDate ? isoWeekday(onDate) : 1 + Math.floor(next() * 7);
    const kind = next() < 0.4 ? "class_hours" : "rental";
    // Weekly rules and 上課時段 are always 不可租 (DB constraints).
    const effect = kind === "rental" && dated && next() < 0.4 ? "open" : "block";
    rules.push({ id: `r${i}`, kind, room: pick(["A", null] as const), weekday, onDate, start, end, effect, reason: "x", archivedAt: null });
  }
  const rentals: RentalSummary[] = [];
  for (let i = 0; i < 3; i++) {
    const [start, end] = range();
    rentals.push(makeRental({ id: `b${i}`, room: "A", date: pick(DATES), start, end, status: pick([RentalStatus.Registered, RentalStatus.Pending]) }));
  }
  return { rules, rentals };
}

describe("rule invariants over random cases (閘門 4)", () => {
  it("holds for 500 seeded cases", () => {
    const next = rng(20261016);
    for (let n = 0; n < 500; n++) {
      const { rules, rentals } = randomCase(next);
      for (const date of DATES) {
        const windows = getAvailableWindows("A", date, { rules, existingRentals: rentals }).map(span);
        const applies = (r: RentalRule) =>
          r.archivedAt === null && (r.onDate === null ? r.weekday === isoWeekday(date) : r.onDate === date);
        const dayOpens = rules.filter((r) => applies(r) && r.effect === "open").map(span);
        const report = () => JSON.stringify({ case: n, date, rules, rentals: rentals.map((r) => [r.date, r.start, r.end, r.status]) });

        for (const w of windows) {
          for (const r of rentals.filter((r) => r.status === RentalStatus.Registered && r.date === date)) {
            expect(overlaps(w, span(r)), `① ${report()}`).toBe(false);
          }
          for (const r of rules.filter((r) => applies(r) && r.effect === "block" && r.onDate !== null)) {
            expect(overlaps(w, span(r)), `② ${report()}`).toBe(false);
          }
          for (const r of rules.filter((r) => applies(r) && r.kind === "class_hours")) {
            // Only the part of a weekly 上課時段 that a 可租 that day lifts may be rented.
            const [s, e] = span(r);
            for (let m = Math.max(s, w[0]); m < Math.min(e, w[1]); m += 10) {
              const lifted = r.onDate === null && dayOpens.some(([os, oe]) => os <= m && m < oe);
              expect(lifted, `③ ${report()}`).toBe(true);
            }
          }
        }

        for (const w of schedulingRangeOn(date, rules).map(span)) {
          const covered = (m: number) =>
            rules.some((r) => applies(r) && r.kind === "class_hours" && r.room !== "B" && span(r)[0] <= m && m < span(r)[1]);
          for (let m = w[0]; m < w[1]; m += 10) expect(covered(m), `range ${report()}`).toBe(true);
        }
      }
    }
  });
});
