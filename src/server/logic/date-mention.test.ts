import { describe, expect, it } from "vitest";
import { resolveDateMention } from "@/server/logic/date-mention";
import type { DateMention } from "@/server/logic/kobeyee-parse";

// Today is a Wednesday throughout this file (isoWeekday("2026-11-04") === 3),
// so "this week" and "next week" land on different, easily checked dates.
const TODAY = "2026-11-04";

function weekday(week: "this" | "next", weekday: number): DateMention {
  return { kind: "weekday", week, weekday };
}

function absolute(month: number, day: number, year: number | null): DateMention {
  return { kind: "absolute", month, day, year };
}

describe("resolveDateMention: weekday", () => {
  it("這週四 resolves inside the current Monday-start week", () => {
    expect(resolveDateMention(weekday("this", 4), TODAY)).toEqual({ date: "2026-11-05", inferredYear: false });
  });

  it("下週四 resolves one week later than 這週四", () => {
    expect(resolveDateMention(weekday("next", 4), TODAY)).toEqual({ date: "2026-11-12", inferredYear: false });
  });

  it("treats Sunday (weekday 7) as the last day of the current week, not the next one", () => {
    // 2026-11-01 is itself a Sunday, so "this week's Sunday" is today.
    expect(resolveDateMention(weekday("this", 7), "2026-11-01")).toEqual({
      date: "2026-11-01",
      inferredYear: false,
    });
  });

  it("下週日, asked on a Sunday, lands 7 days later", () => {
    expect(resolveDateMention(weekday("next", 7), "2026-11-01")).toEqual({
      date: "2026-11-08",
      inferredYear: false,
    });
  });
});

describe("resolveDateMention: relative_day", () => {
  it("明天 is today + 1 day", () => {
    expect(resolveDateMention({ kind: "relative_day", offset: 1 }, TODAY)).toEqual({
      date: "2026-11-05",
      inferredYear: false,
    });
  });

  it("今天 is offset 0", () => {
    expect(resolveDateMention({ kind: "relative_day", offset: 0 }, TODAY)).toEqual({
      date: TODAY,
      inferredYear: false,
    });
  });
});

describe("resolveDateMention: absolute, explicit year", () => {
  it("keeps the stated year and marks it as not inferred", () => {
    expect(resolveDateMention(absolute(10, 1, 2026), TODAY)).toEqual({ date: "2026-10-01", inferredYear: false });
  });

  it("returns null for a day that doesn't exist in that month (2/30)", () => {
    expect(resolveDateMention(absolute(2, 30, 2026), TODAY)).toBeNull();
  });
});

describe("resolveDateMention: absolute, omitted year", () => {
  it("10/1 picks this year when it's the closest of the three candidates", () => {
    expect(resolveDateMention(absolute(10, 1, null), TODAY)).toEqual({ date: "2026-10-01", inferredYear: true });
  });

  it("1/6 picks next year when it's closer than this year's 1/6, already 10 months past", () => {
    expect(resolveDateMention(absolute(1, 6, null), TODAY)).toEqual({ date: "2027-01-06", inferredYear: true });
  });

  it("12/31 asked two days before the new year stays in the current year", () => {
    expect(resolveDateMention(absolute(12, 31, null), "2026-12-30")).toEqual({
      date: "2026-12-31",
      inferredYear: true,
    });
  });

  it("12/31 asked just after the new year resolves to the year just finished", () => {
    expect(resolveDateMention(absolute(12, 31, null), "2027-01-01")).toEqual({
      date: "2026-12-31",
      inferredYear: true,
    });
  });

  it("returns null when no candidate year makes the date exist (2/30)", () => {
    expect(resolveDateMention(absolute(2, 30, null), TODAY)).toBeNull();
  });
});
