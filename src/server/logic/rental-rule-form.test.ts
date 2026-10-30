import { describe, expect, it } from "vitest";
import {
  EMPTY_RULE_DRAFT,
  draftFromRule,
  draftToRows,
  hasDuplicateInputs,
  isDuplicateRule,
  WEEKLY_OPEN_MESSAGE,
  ruleFormReducer,
  validateRuleDraft,
} from "@/server/logic/rental-rule-form";
import type { RuleDraft } from "@/server/logic/rental-rule-form";
import { SAMPLE_RULES, oneDayRule } from "@/server/logic/test-fixtures";

const TODAY = "2026-10-13";

function draft(overrides: Partial<RuleDraft>): RuleDraft {
  return { ...EMPTY_RULE_DRAFT, ...overrides };
}

const MORNINGS = draft({ rooms: ["A"], weekdays: [1, 2, 3, 4], start: "06:00", end: "13:30", reason: "平日白天 13:30 前不開放" });
// 上課時段 have no 原因 in the form.
const CLASS_HOURS = draft({ rooms: ["A"], weekdays: [1, 2, 3, 4], start: "17:30", end: "22:30" });
const CLOSED_NOV_22 = draft({
  rooms: ["A", "B"], mode: "date", onDate: "2026-11-22", start: "12:00", end: "14:00", reason: "臨時封教室",
});

describe("draftToRows (T03)", () => {
  it("N04: weekly with four weekdays → four 租借規則 rows, always 不可租", () => {
    const rows = draftToRows(MORNINGS);
    expect(rows.map((r) => r.weekday)).toEqual([1, 2, 3, 4]);
    expect(rows[0]).toEqual({
      kind: "rental", room: "A", weekday: 1, onDate: null, start: "06:00", end: "13:30", effect: "block", reason: "平日白天 13:30 前不開放",
    });
  });

  it("N05: one day, both rooms → one BOTH row whose weekday follows the date", () => {
    expect(draftToRows(CLOSED_NOV_22)).toEqual([
      { kind: "rental", room: null, weekday: 7, onDate: "2026-11-22", start: "12:00", end: "14:00", effect: "block", reason: "臨時封教室" },
    ]);
  });

  it("上課時段 rows are blocks with the fixed reason 上課時段", () => {
    const rows = draftToRows(CLASS_HOURS, "class_hours");
    expect(rows[0]).toEqual({
      kind: "class_hours", room: "A", weekday: 1, onDate: null, start: "17:30", end: "22:30", effect: "block", reason: "上課時段",
    });
    const dated = draftToRows(draft({ mode: "date", onDate: "2026-10-17", effect: "open", start: "09:00", end: "12:00" }), "class_hours");
    expect(dated[0]).toMatchObject({ kind: "class_hours", effect: "block", weekday: 6, onDate: "2026-10-17" });
  });

  it("N06: an exception opening keeps its effect", () => {
    const open = draft({ rooms: ["A"], mode: "date", onDate: "2026-12-13", effect: "open", start: "13:30", end: "22:30", reason: "成發停課，開放租借" });
    expect(draftToRows(open)[0]).toMatchObject({ effect: "open", weekday: 7 });
  });

  it("trims the reason", () => {
    expect(draftToRows({ ...MORNINGS, reason: "  平日白天 " })[0].reason).toBe("平日白天");
  });
});

describe("validateRuleDraft (T04–T06)", () => {
  it("accepts the BDD examples", () => {
    expect(validateRuleDraft(MORNINGS, TODAY, "create")).toEqual({});
    expect(validateRuleDraft(CLOSED_NOV_22, TODAY, "create")).toEqual({});
  });

  it("T04: room, weekday, date and reason are required; reason up to 30", () => {
    expect(validateRuleDraft({ ...EMPTY_RULE_DRAFT, rooms: [] }, TODAY, "create")).toEqual({
      rooms: "請選教室",
      weekdays: "請選至少一天",
      time: "請填開始和結束時間",
      reason: "請填原因",
    });
    expect(validateRuleDraft({ ...CLOSED_NOV_22, onDate: "", reason: "長".repeat(31) }, TODAY, "create")).toEqual({
      onDate: "請選日期",
      reason: "原因最多 30 字",
    });
  });

  it("AC22: a weekly rule can only be 不可租", () => {
    expect(validateRuleDraft({ ...MORNINGS, effect: "open" }, TODAY, "create")).toEqual({ form: WEEKLY_OPEN_MESSAGE });
    expect(WEEKLY_OPEN_MESSAGE).toBe("每週的規則只能不可租");
  });

  it("上課時段 need no 原因 and can't be 可租", () => {
    expect(validateRuleDraft(CLASS_HOURS, TODAY, "create", "class_hours")).toEqual({});
    const dated = draft({ mode: "date", onDate: "2026-10-17", effect: "open", start: "09:00", end: "12:00" });
    expect(validateRuleDraft(dated, TODAY, "create", "class_hours")).toEqual({ form: "上課時段一定不可租" });
  });

  it("T05 N07: times are 10-minute steps and the end is later than the start", () => {
    expect(validateRuleDraft({ ...MORNINGS, start: "13:30", end: "13:00" }, TODAY, "create")).toEqual({ time: "結束要晚於開始" });
    expect(validateRuleDraft({ ...MORNINGS, start: "13:35" }, TODAY, "create")).toEqual({ time: "時間要以 10 分鐘為單位" });
  });

  it("T06: a one-day row can't be in the past", () => {
    expect(validateRuleDraft({ ...CLOSED_NOV_22, onDate: "2026-10-12" }, TODAY, "create")).toEqual({ onDate: "不能選過去的日期" });
    expect(validateRuleDraft({ ...CLOSED_NOV_22, onDate: TODAY }, TODAY, "create")).toEqual({});
  });

  it("I-03: editing keeps exactly one weekday", () => {
    expect(validateRuleDraft(MORNINGS, TODAY, "edit")).toEqual({ weekdays: "編輯時只能選一天" });
    expect(validateRuleDraft({ ...MORNINGS, weekdays: [5] }, TODAY, "edit")).toEqual({});
  });
});

describe("validateRuleDraft: input from a direct action call", () => {
  const SHAPE = { form: "資料格式不正確，請重新整理再試一次" };
  it.each([
    ["repeated room", { rooms: ["A", "A"] }],
    ["unknown room", { rooms: ["C"] }],
    ["repeated weekday", { weekdays: [1, 1] }],
    ["weekday out of range", { weekdays: [0] }],
    ["fractional weekday", { weekdays: [1.5] }],
    ["unknown mode", { mode: "monthly" }],
    ["unknown effect", { effect: "maybe" }],
    ["impossible date", { mode: "date", weekdays: [], onDate: "2026-02-30" }],
    ["reason not text", { reason: 42 }],
  ])("%s", (_, overrides) => {
    expect(validateRuleDraft({ ...MORNINGS, ...(overrides as object) } as RuleDraft, TODAY, "create")).toEqual(SHAPE);
  });

  it("not an object", () => {
    expect(validateRuleDraft(null as unknown as RuleDraft, TODAY, "create")).toEqual(SHAPE);
  });

  it("rooms in either order mean both", () => {
    expect(draftToRows({ ...CLOSED_NOV_22, rooms: ["B", "A"] })[0].room).toBeNull();
  });
});

describe("hasDuplicateInputs", () => {
  it("rows saved together must differ", () => {
    const rows = draftToRows(MORNINGS);
    expect(hasDuplicateInputs(rows)).toBe(false);
    expect(hasDuplicateInputs([...rows, rows[0]])).toBe(true);
  });
});

describe("ruleFormReducer (T09)", () => {
  it("I-01: switching to one day clears the weekdays; back to weekly clears the date and 這天", () => {
    const toDate = ruleFormReducer(MORNINGS, { type: "setMode", mode: "date" });
    expect(toDate).toMatchObject({ mode: "date", weekdays: [] });
    const withOpen = ruleFormReducer(ruleFormReducer(toDate, { type: "setOnDate", onDate: "2026-12-13" }), { type: "setEffect", effect: "open" });
    expect(ruleFormReducer(withOpen, { type: "setMode", mode: "weekly" })).toMatchObject({ mode: "weekly", onDate: "", effect: "block" });
  });

  it("weekdays stay in Monday-first order", () => {
    expect(ruleFormReducer(EMPTY_RULE_DRAFT, { type: "setWeekdays", weekdays: [7, 1, 3] }).weekdays).toEqual([1, 3, 7]);
  });

  it("draftFromRule fills the form from a row", () => {
    expect(draftFromRule(SAMPLE_RULES[0])).toEqual({
      rooms: ["A"], mode: "weekly", weekdays: [1], onDate: "", effect: "block", start: "17:30", end: "22:30", reason: "上課時段",
    });
    const both = oneDayRule("d", "2026-11-22", { room: null, start: "12:00", end: "14:00", reason: "臨時封教室" });
    expect(draftFromRule(both)).toMatchObject({ rooms: ["A", "B"], mode: "date", onDate: "2026-11-22", weekdays: [] });
  });
});

describe("isDuplicateRule (T08)", () => {
  it("N09: same kind, room, day, time and effect as an active row", () => {
    const [monday] = draftToRows(CLASS_HOURS, "class_hours");
    expect(isDuplicateRule(monday, SAMPLE_RULES)).toBe(true);
    expect(isDuplicateRule({ ...monday, end: "23:00" }, SAMPLE_RULES)).toBe(false);
    expect(isDuplicateRule({ ...monday, room: null }, SAMPLE_RULES)).toBe(false);
    // The same time as a 租借規則 is a different row.
    expect(isDuplicateRule({ ...monday, kind: "rental" }, SAMPLE_RULES)).toBe(false);
  });

  it("ignores archived rows and the row being edited", () => {
    const [monday] = draftToRows(CLASS_HOURS, "class_hours");
    const archived = SAMPLE_RULES.map((r) => (r.id === "R1-1" ? { ...r, archivedAt: "2026-10-01T00:00:00Z" } : r));
    expect(isDuplicateRule(monday, archived)).toBe(false);
    expect(isDuplicateRule(monday, SAMPLE_RULES, "R1-1")).toBe(false);
  });
});
