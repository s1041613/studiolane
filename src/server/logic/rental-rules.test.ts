import { describe, expect, it } from "vitest";
import { ruleDayLabel, rulesForWeek, sortRulesForList, visibleInWeek, weekStartOf } from "@/server/logic/rental-rules";
import { SAMPLE_RULES, oneDayRule } from "@/server/logic/test-fixtures";

// Today is 10/13; the 12/13 exception opening is the planned row.
const OPEN_DEC_13 = oneDayRule("open-1213", "2026-12-13", {
  room: "A", start: "13:30", end: "22:30", effect: "open", reason: "成發停課，開放租借",
});
const RULES = [...SAMPLE_RULES, OPEN_DEC_13];

describe("weekStartOf", () => {
  it("goes back to Monday", () => {
    expect(weekStartOf("2026-12-13")).toBe("2026-12-07");
    expect(weekStartOf("2026-12-07")).toBe("2026-12-07");
  });
});

describe("rulesForWeek (T01)", () => {
  it("N01: weekly rows on every matching day; 12/13's business hours are covered by the opening", () => {
    const week = rulesForWeek(RULES, "2026-12-07", "A");
    expect(week.map((d) => d.date)).toEqual([
      "2026-12-07", "2026-12-08", "2026-12-09", "2026-12-10", "2026-12-11", "2026-12-12", "2026-12-13",
    ]);
    expect(week[0].entries.map((e) => [e.start, e.rule.reason, e.lifted])).toEqual([
      ["06:00", "平日白天 13:30 前不開放", false],
      ["17:30", "上課時段", false],
    ]);
    const sunday = week[6].entries.map((e) => [e.rule.id, e.start, e.end, e.lifted]);
    expect(sunday).toEqual([
      ["R2-7", "13:30", "22:30", true],
      ["open-1213", "13:30", "22:30", false],
    ]);
  });

  it("a partial opening lifts only the part it covers, as bookings see it", () => {
    const partial = oneDayRule("open-part", "2026-12-13", { room: "A", start: "18:00", end: "19:00", effect: "open", reason: "加開" });
    const sunday = rulesForWeek([...SAMPLE_RULES, partial], "2026-12-07", "A")[6];
    expect(sunday.entries.map((e) => [e.rule.id, e.start, e.end, e.lifted])).toEqual([
      ["R2-7", "13:30", "18:00", false],
      ["R2-7", "18:00", "19:00", true],
      ["open-part", "18:00", "19:00", false],
      ["R2-7", "19:00", "22:30", false],
    ]);
  });

  it("N03: the one-day row only shows up in its own week", () => {
    const nextWeek = rulesForWeek(RULES, "2026-12-14", "A");
    expect(nextWeek[6].entries.map((e) => [e.rule.id, e.lifted])).toEqual([["R2-7", false]]);
  });

  it("room B shows B and BOTH rows, not A's", () => {
    const week = rulesForWeek(RULES, "2026-12-07", "B");
    expect(week[0].entries.map((e) => e.rule.reason)).toEqual(["準備時間", "清掃時間"]);
  });

  it("archived rows are left out", () => {
    const archived = RULES.map((r) => (r.id === "R3-1" ? { ...r, archivedAt: "2026-10-13T00:00:00Z" } : r));
    expect(rulesForWeek(archived, "2026-12-07", "A")[0].entries.map((e) => e.rule.id)).toEqual(["R1-1"]);
  });
});

describe("sortRulesForList (T02)", () => {
  it("N02: one line per row — weekly by weekday then start, then one-day rows by date", () => {
    const later = oneDayRule("d2", "2026-11-22", { room: null, start: "12:00", end: "14:00", reason: "臨時封教室" });
    const sorted = sortRulesForList([OPEN_DEC_13, ...SAMPLE_RULES.filter((r) => r.room === "A"), later]);
    expect(sorted.slice(0, 3).map((r) => r.id)).toEqual(["R3-1", "R1-1", "R3-2"]);
    expect(sorted.slice(-2).map((r) => r.id)).toEqual(["d2", "open-1213"]);
  });
});

describe("visibleInWeek / ruleDayLabel", () => {
  it("weekly rows are always visible; one-day rows only in their week", () => {
    expect(visibleInWeek(SAMPLE_RULES[0], "2026-10-12")).toBe(true);
    expect(visibleInWeek(OPEN_DEC_13, "2026-12-07")).toBe(true);
    expect(visibleInWeek(OPEN_DEC_13, "2026-12-14")).toBe(false);
  });

  it("labels the day like the list column", () => {
    expect(ruleDayLabel(SAMPLE_RULES[0])).toBe("週一");
    expect(ruleDayLabel(OPEN_DEC_13)).toBe("12/13（日）");
  });
});
