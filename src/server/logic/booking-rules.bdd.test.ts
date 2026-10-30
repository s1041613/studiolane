import { describe, expect, it } from "vitest";
import { checkBooking, clipWindowsToNow, getAvailableWindows, isDateDisabled } from "@/server/logic/booking-rules";
import type { RentalRule, RuleContext } from "@/server/logic/booking-rules";
import type { SlotDraft } from "@/server/logic/booking";
import { RentalStatus } from "@/server/types/home";
import { SAMPLE_RULES, makeRental, oneDayRule, weeklyRules } from "@/server/logic/test-fixtures";

function ctx(overrides: Partial<RuleContext> = {}): RuleContext {
  return { rules: SAMPLE_RULES, existingRentals: [], ...overrides };
}

function slot(overrides: Partial<SlotDraft> = {}): SlotDraft {
  return { date: "2026-10-06", start: "14:00", end: "16:00", isCrossMidnight: false, ...overrides };
}

// 2026-10-07 is a Wednesday (weekday 3).
const [WEDNESDAY_CLOSED_A] = weeklyRules("closed-A", [3], { room: "A", start: "00:00", end: "24:00", reason: "A 教室整天關閉" });
const [WEDNESDAY_CLOSED_B] = weeklyRules("closed-B", [3], { room: "B", start: "00:00", end: "24:00", reason: "B 教室整天關閉" });

describe("日期", () => {
  it("F-日期-2: 今天以前的日期反灰", () => {
    expect(isDateDisabled("2026-10-09", "2026-10-10", ctx())).toBe(true);
    expect(isDateDisabled("2026-10-10", "2026-10-10", ctx())).toBe(false);
  });

  it("F-日期-3: A、B 兩間那天都完全沒空檔才反灰", () => {
    const both = ctx({ rules: [...SAMPLE_RULES, WEDNESDAY_CLOSED_A, WEDNESDAY_CLOSED_B] });
    expect(isDateDisabled("2026-10-07", "2026-10-01", both)).toBe(true);
  });

  it("F-日期-3: 只看已登記的預約；待確認的預約不算占用", () => {
    const fullDayB = (status: RentalStatus) =>
      makeRental({ room: "B", date: "2026-10-07", start: "00:00", end: "00:00", isCrossMidnight: true, status });
    const withA = [...SAMPLE_RULES, WEDNESDAY_CLOSED_A];
    expect(
      isDateDisabled("2026-10-07", "2026-10-01", ctx({ rules: withA, existingRentals: [fullDayB(RentalStatus.Registered)] })),
    ).toBe(true);
    expect(
      isDateDisabled("2026-10-07", "2026-10-01", ctx({ rules: withA, existingRentals: [fullDayB(RentalStatus.Pending)] })),
    ).toBe(false);
  });

  it("F-日期-4: 只有一間沒空檔時，日期照樣可以選", () => {
    const onlyA = ctx({ rules: [...SAMPLE_RULES, WEDNESDAY_CLOSED_A] });
    expect(isDateDisabled("2026-10-07", "2026-10-01", onlyA)).toBe(false);
  });
});

describe("每天的時間", () => {
  it("F-時間-2: 空檔扣掉這間教室那天的規則", () => {
    // Tuesday room A: R1 17:30–22:30 and R3 06:00–13:30 apply.
    expect(getAvailableWindows("A", "2026-10-06", ctx())).toEqual([
      { start: "00:00", end: "06:00" },
      { start: "13:30", end: "17:30" },
      { start: "22:30", end: "24:00" },
    ]);
  });

  it("F-時間-2: 空檔也扣掉已登記的預約", () => {
    const registered = makeRental({ room: "A", date: "2026-10-06", start: "14:30", end: "15:30", status: RentalStatus.Registered });
    expect(getAvailableWindows("A", "2026-10-06", ctx({ existingRentals: [registered] }))).toEqual([
      { start: "00:00", end: "06:00" },
      { start: "13:30", end: "14:30" },
      { start: "15:30", end: "17:30" },
      { start: "22:30", end: "24:00" },
    ]);
  });

  it("F-時間-5: 時段相接不算重疊", () => {
    const registered = makeRental({ room: "A", date: "2026-10-06", start: "14:00", end: "15:00", status: RentalStatus.Registered });
    const result = checkBooking(slot({ start: "15:00", end: "16:00" }), "A", ctx({ existingRentals: [registered] }));
    expect(result).toEqual({ ok: true });
  });

  it("F-時間-5: 前一晚跨日的已登記預約會擋隔天凌晨", () => {
    // Thursday 2026-10-08 22:30 → Friday 00:30; Friday 00:00–01:00 overlaps it.
    const registered = makeRental({
      room: "A", date: "2026-10-08", start: "22:30", end: "00:30", isCrossMidnight: true, status: RentalStatus.Registered,
    });
    const result = checkBooking(slot({ date: "2026-10-09", start: "00:00", end: "01:00" }), "A", ctx({ existingRentals: [registered] }));
    expect(result.ok).toBe(false);
  });

  it.each([
    { label: "沒填", start: "", end: "", isCrossMidnight: false, reason: "請填開始和結束時間" },
    { label: "格式不對", start: "25:00", end: "26:00", isCrossMidnight: false, reason: "時間格式不正確" },
    { label: "沒勾跨日但結束早於開始", start: "16:00", end: "14:00", isCrossMidnight: false, reason: "結束時間必須晚於開始時間" },
    { label: "勾了跨日但結束沒早於開始", start: "14:00", end: "16:00", isCrossMidnight: true, reason: "已勾選跨日，結束時間應該早於開始時間" },
    { label: "撞到規則", start: "17:00", end: "18:00", isCrossMidnight: false, reason: "10/6 17:30–22:30：上課時段" },
  ])("F-時間-6: $label → 「$reason」", ({ start, end, isCrossMidnight, reason }) => {
    const result = checkBooking(slot({ start, end, isCrossMidnight }), "A", ctx());
    expect(result).toMatchObject({ ok: false, reason });
  });

  it("F-時間-6 / S-6: 撞到已登記 → 「14:30–15:30 已有人預約」", () => {
    const registered = makeRental({ room: "A", date: "2026-10-06", start: "14:30", end: "15:30", status: RentalStatus.Registered });
    const result = checkBooking(slot({ start: "14:00", end: "16:00" }), "A", ctx({ existingRentals: [registered] }));
    expect(result).toMatchObject({ ok: false, reason: "14:30–15:30 已有人預約" });
  });

  it("F-時間-8: 這間教室那天完全沒空檔 → 沒有可預約的時段", () => {
    const closed = ctx({ rules: [...SAMPLE_RULES, WEDNESDAY_CLOSED_A] });
    expect(getAvailableWindows("A", "2026-10-07", closed)).toEqual([]);
  });
});

describe("今天已經過去的時間", () => {
  const windows = [
    { start: "00:00", end: "06:00" },
    { start: "13:30", end: "17:30" },
    { start: "22:30", end: "24:00" },
  ];

  it("F-時間-9: 今天的空檔從現在（往後取整半點）開始", () => {
    // 2026-10-06 14:10 Taipei → windows start at 14:30.
    expect(clipWindowsToNow(windows, "2026-10-06", new Date("2026-10-06T14:10:00+08:00"))).toEqual([
      { start: "14:30", end: "17:30" },
      { start: "22:30", end: "24:00" },
    ]);
  });

  it("F-時間-9: 剛好整半點時從那個時間開始", () => {
    expect(clipWindowsToNow(windows, "2026-10-06", new Date("2026-10-06T14:00:00+08:00"))[0]).toEqual({
      start: "14:00",
      end: "17:30",
    });
  });

  it("F-時間-9: 不是今天的日期不受影響", () => {
    expect(clipWindowsToNow(windows, "2026-10-07", new Date("2026-10-06T14:10:00+08:00"))).toEqual(windows);
  });

  it("F-時間-9: 今天已經全部過去 → 沒有空檔", () => {
    expect(clipWindowsToNow(windows, "2026-10-06", new Date("2026-10-06T23:50:00+08:00"))).toEqual([]);
  });
});

describe("延期／取消後的時段", () => {
  it.each([RentalStatus.Postponed, RentalStatus.Cancelled])("T-延取-5: %s 的預約不占用時段", (status) => {
    const released = makeRental({ room: "A", date: "2026-10-06", start: "14:00", end: "16:00", status });
    const result = checkBooking(slot(), "A", ctx({ existingRentals: [released] }));
    expect(result).toEqual({ ok: true });
  });
});

// 租借時段 N15–N19 (docs/settings/rental-rules/02-bdd.html), T15–T19.
describe("租借時段：預約表單", () => {
  const OPEN_DEC_13 = oneDayRule("open-1213", "2026-12-13", {
    room: "A", start: "13:30", end: "22:30", effect: "open", reason: "成發停課，開放租借",
  });
  const SETUP_DEC_13 = oneDayRule("setup-1213", "2026-12-13", { room: "A", start: "15:00", end: "17:00", reason: "場地布置" });
  const rules: RentalRule[] = [...SAMPLE_RULES, OPEN_DEC_13];

  it("T15 / T16 N15: 上課時段不能約，訊息是那一列的時段與原因", () => {
    expect(checkBooking(slot({ date: "2026-11-09", start: "18:00", end: "19:00" }), "A", ctx())).toEqual({
      ok: false,
      reason: "11/9 17:30–22:30：上課時段",
    });
  });

  it("T15 N16: 平日白天不能約", () => {
    expect(checkBooking(slot({ date: "2026-11-10", start: "10:00", end: "12:00" }), "A", ctx())).toEqual({
      ok: false,
      reason: "11/10 06:00–13:30：平日白天 13:30 前不開放",
    });
  });

  it("T15: 已停用的列不擋", () => {
    const archived = SAMPLE_RULES.map((r) => (r.id === "R1-1" ? { ...r, archivedAt: "2026-10-13T00:00:00Z" } : r));
    expect(checkBooking(slot({ date: "2026-11-09", start: "18:00", end: "19:00" }), "A", ctx({ rules: archived }))).toEqual({ ok: true });
  });

  it("T15: 某一天的列只擋那一天", () => {
    const closed = oneDayRule("closed-1122", "2026-11-22", { room: null, start: "12:00", end: "14:00", reason: "臨時封教室" });
    const withClosed = ctx({ rules: [...SAMPLE_RULES, closed] });
    expect(checkBooking(slot({ date: "2026-11-22", start: "12:00", end: "13:00" }), "B", withClosed)).toEqual({
      ok: false,
      reason: "11/22 12:00–14:00：臨時封教室",
    });
    expect(checkBooking(slot({ date: "2026-11-29", start: "12:00", end: "13:00" }), "B", withClosed)).toEqual({ ok: true });
  });

  it("T17 N17: B 間不受 A 間的列影響；BOTH 兩間都算", () => {
    expect(checkBooking(slot({ date: "2026-11-09", start: "18:00", end: "19:00" }), "B", ctx())).toEqual({ ok: true });
    const both = weeklyRules("both", [1], { room: null, start: "18:00", end: "19:00", reason: "消毒" });
    expect(checkBooking(slot({ date: "2026-11-09", start: "18:00", end: "19:00" }), "B", ctx({ rules: [...SAMPLE_RULES, ...both] }))).toMatchObject({
      ok: false,
    });
  });

  it("T18 N18: 例外開放只扣掉那一天的每週固定不能租", () => {
    expect(checkBooking(slot({ date: "2026-12-13", start: "19:00", end: "21:00" }), "A", ctx({ rules }))).toEqual({ ok: true });
    expect(checkBooking(slot({ date: "2026-12-20", start: "19:00", end: "21:00" }), "A", ctx({ rules }))).toEqual({
      ok: false,
      reason: "12/20 13:30–22:30：上課時段",
    });
    expect(getAvailableWindows("A", "2026-12-13", ctx({ rules }))).toEqual([{ start: "00:00", end: "24:00" }]);
  });

  it("T18: 例外開放只開它自己的時段，其餘仍照每週固定", () => {
    const partial = oneDayRule("open-part", "2026-12-13", { room: "A", start: "18:00", end: "20:00", effect: "open", reason: "加開" });
    expect(getAvailableWindows("A", "2026-12-13", ctx({ rules: [...SAMPLE_RULES, partial] }))).toEqual([
      { start: "00:00", end: "13:30" },
      { start: "18:00", end: "20:00" },
      { start: "22:30", end: "24:00" },
    ]);
    expect(checkBooking(slot({ date: "2026-12-13", start: "17:00", end: "19:00" }), "A", ctx({ rules: [...SAMPLE_RULES, partial] }))).toEqual({
      ok: false,
      reason: "12/13 13:30–18:00：上課時段",
    });
  });

  it("T19 N19: 某一天不能租不會被例外開放扣掉", () => {
    const withSetup = ctx({ rules: [...rules, SETUP_DEC_13] });
    expect(checkBooking(slot({ date: "2026-12-13", start: "15:00", end: "16:00" }), "A", withSetup)).toEqual({
      ok: false,
      reason: "12/13 15:00–17:00：場地布置",
    });
    expect(checkBooking(slot({ date: "2026-12-13", start: "18:00", end: "20:00" }), "A", withSetup)).toEqual({ ok: true });
  });

  it("跨日預約的隔天部分用隔天的日期", () => {
    // Sunday 2026-11-08 22:30 → Monday 07:00 runs into Monday's 平日白天 row.
    expect(
      checkBooking(slot({ date: "2026-11-08", start: "22:30", end: "07:00", isCrossMidnight: true }), "A", ctx()),
    ).toEqual({ ok: false, reason: "11/9 06:00–13:30：平日白天 13:30 前不開放" });
  });
});
