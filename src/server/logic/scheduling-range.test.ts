import { describe, expect, it } from "vitest";
import {
  isWithinRange,
  normalizeTimeInput,
  outsideRangeMessage,
  rangeForSession,
  schedulingRangeFor,
  schedulingRangeOn,
  timeRangeError,
} from "@/server/logic/scheduling-range";
import type { RentalRule } from "@/server/logic/booking-rules";
import { BASE_RULES, oneDayRule, weeklyRules } from "@/server/logic/test-fixtures";

describe("timeRangeError (TimeRangePicker, T10)", () => {
  it.each([
    { start: "", end: "", error: "請填開始和結束時間" },
    { start: "13:30", end: "", error: "請填開始和結束時間" },
    { start: "1330", end: "14:00", error: "時間格式不正確" },
    { start: "13:35", end: "14:00", error: "時間要以 10 分鐘為單位" },
    { start: "13:30", end: "13:00", error: "結束要晚於開始" },
    { start: "13:30", end: "13:30", error: "結束要晚於開始" },
    { start: "13:30", end: "22:30", error: null },
    { start: "22:30", end: "24:00", error: null },
  ])("$start–$end → $error", ({ start, end, error }) => {
    expect(timeRangeError(start, end)).toBe(error);
  });
});

// docs/rental-time-rules/02-bdd 排課: only 上課時段 (kind class_hours) shape
// the range; 租借規則 (平日白天, maintenance, openings) never do.
const DAY_CLASS_1017 = oneDayRule("ch-1017", "2026-10-17", { kind: "class_hours", room: "A", start: "09:00", end: "12:00", reason: "上課時段" });
const MAINT_1205 = oneDayRule("maint-1205", "2026-12-05", { room: "A", start: "15:00", end: "16:00", reason: "教室維修" });
const OPEN_1213 = oneDayRule("open-1213", "2026-12-13", { room: "A", start: "13:30", end: "22:30", effect: "open", reason: "成發停課，開放租借" });

describe("schedulingRangeFor (T13)", () => {
  it("AC01: a regular class inside the weekly 上課時段 fits", () => {
    const range = schedulingRangeFor(1, BASE_RULES);
    expect(range).toEqual([{ start: "17:30", end: "22:30" }]);
    expect(isWithinRange("17:30", "19:00", range)).toBe(true);
  });

  it("AC02: 16:30–17:30 is outside; 平日白天 (a 租借規則) never counts", () => {
    const range = schedulingRangeFor(1, BASE_RULES);
    expect(isWithinRange("16:30", "17:30", range)).toBe(false);
    expect(isWithinRange("10:00", "12:00", range)).toBe(false);
  });

  it("ignores room B, 租借規則 and archived rows; a both-rooms 上課時段 counts", () => {
    const rules: RentalRule[] = [
      ...weeklyRules("a", [1], { kind: "class_hours", room: "A", start: "17:30", end: "22:30", reason: "上課時段" }),
      ...weeklyRules("b", [1], { kind: "class_hours", room: "B", start: "09:00", end: "10:00", reason: "上課時段" }),
      ...weeklyRules("both", [1], { kind: "class_hours", room: null, start: "15:00", end: "16:00", reason: "上課時段" }),
      ...weeklyRules("rent", [1], { room: "A", start: "06:00", end: "08:00", reason: "消毒" }),
      ...weeklyRules("old", [1], { kind: "class_hours", room: "A", start: "11:00", end: "12:00", reason: "上課時段", archivedAt: "2026-10-01T00:00:00Z" }),
    ];
    expect(schedulingRangeFor(1, rules)).toEqual([
      { start: "15:00", end: "16:00" },
      { start: "17:30", end: "22:30" },
    ]);
  });
});

describe("schedulingRangeOn (T14)", () => {
  it("AC03: that date's own 上課時段 adds to the weekly ones", () => {
    const range = schedulingRangeOn("2026-10-17", [...BASE_RULES, DAY_CLASS_1017]);
    expect(range).toEqual([
      { start: "09:00", end: "12:00" },
      { start: "13:30", end: "22:30" },
    ]);
    expect(isWithinRange("09:00", "10:30", range)).toBe(true);
  });

  it("AC04: a dated 上課時段 only covers its own date", () => {
    const range = schedulingRangeOn("2026-10-24", [...BASE_RULES, DAY_CLASS_1017]);
    expect(range).toEqual([{ start: "13:30", end: "22:30" }]);
    expect(isWithinRange("09:00", "10:30", range)).toBe(false);
  });

  it("AC05: a maintenance block doesn't change the range", () => {
    const range = schedulingRangeOn("2026-12-05", [...BASE_RULES, MAINT_1205]);
    expect(range).toEqual([{ start: "13:30", end: "22:30" }]);
    expect(isWithinRange("15:00", "16:00", range)).toBe(true);
  });

  it("AC06: a one-day opening doesn't change the range", () => {
    const range = schedulingRangeOn("2026-12-13", [...BASE_RULES, OPEN_1213]);
    expect(range).toEqual([{ start: "13:30", end: "22:30" }]);
    expect(isWithinRange("15:00", "16:00", range)).toBe(true);
  });
});

describe("isWithinRange", () => {
  const range = [
    { start: "06:00", end: "13:30" },
    { start: "17:30", end: "22:30" },
  ];
  it("must fit inside one stretch", () => {
    expect(isWithinRange("17:30", "19:00", range)).toBe(true);
    expect(isWithinRange("13:00", "18:00", range)).toBe(false);
    expect(isWithinRange("17:00", "18:00", range)).toBe(false);
  });
});

describe("normalizeTimeInput (TimeRangePicker close)", () => {
  it.each([
    ["1330", "13:30"],
    ["930", "09:30"],
    ["9:30", "09:30"],
    ["13：30", "13:30"],
    [" 22:30 ", "22:30"],
    ["24", "24:00"],
    ["7", "07:00"],
    ["abc", "abc"],
    ["", ""],
  ])("%s → %s", (raw, expected) => {
    expect(normalizeTimeInput(raw)).toBe(expected);
  });
});

// T13 / T14 / I-05: the message, and which range a class is checked against.
describe("outsideRangeMessage / rangeForSession", () => {
  it("K12: names the weekday's windows", () => {
    expect(outsideRangeMessage("週一", schedulingRangeFor(1, BASE_RULES))).toBe(
      "超出週一可排課的時段（17:30–22:30），請先到上課時段修改",
    );
  });

  it("K19: a dated class uses that day's range, including that day's own 上課時段", () => {
    const rules = [...BASE_RULES, oneDayRule("late", "2026-11-03", { kind: "class_hours", room: "A", start: "22:30", end: "23:30", reason: "上課時段" })];
    expect(rangeForSession(2, "2026-11-03", BASE_RULES)).toEqual([{ start: "17:30", end: "22:30" }]);
    expect(isWithinRange("22:30", "23:30", rangeForSession(2, "2026-11-03", rules))).toBe(true);
    expect(isWithinRange("22:30", "23:30", rangeForSession(2, null, rules))).toBe(false);
  });

  it("says so when a day has no range at all", () => {
    expect(outsideRangeMessage("週一", [])).toBe("超出週一可排課的時段（沒有可排課的時段），請先到上課時段修改");
  });
});
