import { describe, expect, it } from "vitest";
import { checkBooking, getAvailableWindows } from "@/server/logic/booking-rules";
import type { RentalRule } from "@/server/logic/booking-rules";
import { rentalsBrokenBy } from "@/server/logic/rule-impact";
import { BASE_RULES, makeRental, oneDayRule } from "@/server/logic/test-fixtures";
import { RentalStatus } from "@/server/types/home";

// docs/rental-time-rules/02-bdd: 預約 AC10–AC18 and 改規則 AC24–AC31, with the
// inputs and outputs written in that document's data blocks. 共用資料 is
// BASE_RULES (上課時段 一～四 17:30–22:30、五～日 13:30–22:30；平日白天
// 一～五 06:00–13:30 不可租), room A, 2026. Nothing blocks 00:00–06:00.

const NOW = new Date("2026-10-13T10:00:00+08:00");

const slot = (date: string, start: string, end: string) => ({ date, start, end, isCrossMidnight: false });
const rental = (id: string, date: string, start: string, end: string, status: RentalStatus) =>
  makeRental({ id, date, start, end, status, room: "A" });

const DAY_CLASS_1017 = oneDayRule("ch-1017", "2026-10-17", { kind: "class_hours", room: "A", start: "09:00", end: "12:00", reason: "上課時段" });
// Weekend mornings are rentable, so these changes really take time away.
const DAY_CLASS_1024 = oneDayRule("ch-1024", "2026-10-24", { kind: "class_hours", room: "A", start: "09:00", end: "12:00", reason: "上課時段" });
const OPEN_1213 = oneDayRule("open-1213", "2026-12-13", { room: "A", start: "13:30", end: "22:30", effect: "open", reason: "成發停課，開放租借" });
const MAINT_1205 = oneDayRule("maint-1205", "2026-12-05", { room: "A", start: "10:00", end: "11:00", reason: "教室維修" });

describe("預約 (checkBooking)", () => {
  it("AC10 平常的空檔可以租", () => {
    expect(getAvailableWindows("A", "2026-10-14", { rules: BASE_RULES, existingRentals: [] })).toEqual([
      { start: "00:00", end: "06:00" },
      { start: "13:30", end: "17:30" },
      { start: "22:30", end: "24:00" },
    ]);
    expect(checkBooking(slot("2026-10-14", "13:30", "15:00"), "A", { rules: BASE_RULES, existingRentals: [] })).toEqual({ ok: true });
  });

  it("AC11 租不到上課時段", () => {
    expect(checkBooking(slot("2026-10-14", "17:00", "18:00"), "A", { rules: BASE_RULES, existingRentals: [] })).toEqual({
      ok: false,
      reason: "10/14 17:30–22:30：上課時段",
    });
  });

  it("AC12 租不到每週不可租", () => {
    expect(checkBooking(slot("2026-10-14", "10:00", "12:00"), "A", { rules: BASE_RULES, existingRentals: [] })).toEqual({
      ok: false,
      reason: "10/14 06:00–13:30：平日白天 13:30 前不開放",
    });
  });

  it("AC13 租不到已登記的時間", () => {
    const existingRentals = [rental("r1", "2026-10-14", "14:00", "15:00", RentalStatus.Registered)];
    expect(checkBooking(slot("2026-10-14", "14:30", "16:00"), "A", { rules: BASE_RULES, existingRentals })).toEqual({
      ok: false,
      reason: "14:00–15:00 已有人預約",
    });
  });

  it("AC14 待確認不擋新預約", () => {
    const existingRentals = [rental("r1", "2026-10-14", "14:00", "15:00", RentalStatus.Pending)];
    expect(checkBooking(slot("2026-10-14", "14:30", "16:00"), "A", { rules: BASE_RULES, existingRentals })).toEqual({ ok: true });
  });

  it("AC15 租不到那天上課時段", () => {
    expect(checkBooking(slot("2026-10-17", "09:30", "10:00"), "A", { rules: [...BASE_RULES, DAY_CLASS_1017], existingRentals: [] })).toEqual({
      ok: false,
      reason: "10/17 09:00–12:00：上課時段",
    });
  });

  it("AC16 那天可租把上課時段加回來", () => {
    expect(checkBooking(slot("2026-12-13", "18:00", "20:00"), "A", { rules: [...BASE_RULES, OPEN_1213], existingRentals: [] })).toEqual({
      ok: true,
    });
  });

  it("AC17 那天可租加不回已登記", () => {
    const existingRentals = [rental("r2", "2026-12-13", "10:00", "12:00", RentalStatus.Registered)];
    expect(checkBooking(slot("2026-12-13", "11:00", "13:00"), "A", { rules: [...BASE_RULES, OPEN_1213], existingRentals })).toEqual({
      ok: false,
      reason: "10:00–12:00 已有人預約",
    });
  });

  it("AC18 維修擋得住那天可租", () => {
    const setup = oneDayRule("block-1213", "2026-12-13", { room: "A", start: "15:00", end: "16:00", reason: "場地布置" });
    expect(
      checkBooking(slot("2026-12-13", "15:00", "16:00"), "A", { rules: [...BASE_RULES, OPEN_1213, setup], existingRentals: [] }),
    ).toEqual({ ok: false, reason: "12/13 15:00–16:00：場地布置" });
  });
});

describe("改規則 (rentalsBrokenBy)", () => {
  const ids = (rules: { before: RentalRule[]; after: RentalRule[] }, rentals: ReturnType<typeof rental>[]) =>
    rentalsBrokenBy(rules.before, rules.after, rentals, NOW).map((r) => r.id);

  it("AC24 上課時段蓋到已登記", () => {
    const rentals = [rental("r4", "2026-10-24", "09:00", "11:00", RentalStatus.Registered)];
    expect(ids({ before: BASE_RULES, after: [...BASE_RULES, DAY_CLASS_1024] }, rentals)).toEqual(["r4"]);
  });

  it("AC25 待確認也受保護", () => {
    const rentals = [rental("r5", "2026-10-24", "09:00", "11:00", RentalStatus.Pending)];
    expect(ids({ before: BASE_RULES, after: [...BASE_RULES, DAY_CLASS_1024] }, rentals)).toEqual(["r5"]);
  });

  it("AC26 那天可租有預約不能停用", () => {
    const rentals = [rental("r6", "2026-12-13", "18:00", "20:00", RentalStatus.Registered)];
    const after = [...BASE_RULES, { ...OPEN_1213, archivedAt: "2026-10-16T10:00:00+08:00" }];
    expect(ids({ before: [...BASE_RULES, OPEN_1213], after }, rentals)).toEqual(["r6"]);
  });

  it("AC27 那天可租有預約不能縮短", () => {
    const rentals = [rental("r6", "2026-12-13", "18:00", "20:00", RentalStatus.Registered)];
    const after = [...BASE_RULES, { ...OPEN_1213, end: "17:00" }];
    expect(ids({ before: [...BASE_RULES, OPEN_1213], after }, rentals)).toEqual(["r6"]);
  });

  it("AC28 維修蓋到已登記", () => {
    const rentals = [rental("r7", "2026-12-05", "10:00", "11:00", RentalStatus.Registered)];
    expect(ids({ before: BASE_RULES, after: [...BASE_RULES, MAINT_1205] }, rentals)).toEqual(["r7"]);
  });

  it("AC29 預約處理掉就能存", () => {
    const rentals = [rental("r7", "2026-12-05", "10:00", "11:00", RentalStatus.Cancelled)];
    expect(ids({ before: BASE_RULES, after: [...BASE_RULES, MAINT_1205] }, rentals)).toEqual([]);
  });

  it("AC30 拉長每週不可租", () => {
    const rentals = [rental("r8", "2026-10-21", "13:30", "15:00", RentalStatus.Registered)];
    const after = BASE_RULES.map((r) => (r.id === "am-3" ? { ...r, end: "15:00" } : r));
    expect(ids({ before: BASE_RULES, after }, rentals)).toEqual(["r8"]);
  });

  it("K7 跨日預約：隔天凌晨的新不可租也算", () => {
    // 週日 10/18 23:00 → 週一 10/19 03:00; only the Monday part is hit.
    const crossing = makeRental({
      id: "r10", room: "A", date: "2026-10-18", start: "23:00", end: "03:00", isCrossMidnight: true, status: RentalStatus.Registered,
    });
    const hit = oneDayRule("block-1019", "2026-10-19", { room: "A", start: "01:00", end: "02:00", reason: "教室維修" });
    const clear = oneDayRule("block-1019b", "2026-10-19", { room: "A", start: "04:00", end: "05:00", reason: "教室維修" });
    expect(rentalsBrokenBy(BASE_RULES, [...BASE_RULES, hit], [crossing], NOW).map((r) => r.id)).toEqual(["r10"]);
    expect(rentalsBrokenBy(BASE_RULES, [...BASE_RULES, clear], [crossing], NOW)).toEqual([]);
  });

  it("K7 A＋B 的規則兩間的預約都算", () => {
    const both = oneDayRule("block-1024", "2026-10-24", { room: null, start: "09:00", end: "11:00", reason: "全館消毒" });
    const rentals = [
      makeRental({ id: "rA", room: "A", date: "2026-10-24", start: "10:00", end: "11:00", status: RentalStatus.Registered }),
      makeRental({ id: "rB", room: "B", date: "2026-10-24", start: "10:00", end: "11:00", status: RentalStatus.Registered }),
    ];
    expect(ids({ before: BASE_RULES, after: [...BASE_RULES, both] }, rentals)).toEqual(["rA", "rB"]);
  });

  it("AC31 啟用不可租也要檢查", () => {
    const archived = oneDayRule("block-1206", "2026-12-06", {
      room: "A", start: "10:00", end: "11:00", reason: "場地布置", archivedAt: "2026-10-01T00:00:00+08:00",
    });
    const rentals = [rental("r9", "2026-12-06", "10:00", "11:00", RentalStatus.Registered)];
    expect(ids({ before: [...BASE_RULES, archived], after: [...BASE_RULES, { ...archived, archivedAt: null }] }, rentals)).toEqual(["r9"]);
  });

  it("a booking that already clashed, or has already started, is not reported", () => {
    const started = rental("past", "2026-10-12", "14:00", "15:00", RentalStatus.Registered);
    const clashing = [
      rental("a", "2026-12-05", "10:00", "11:00", RentalStatus.Registered),
      rental("b", "2026-12-05", "10:00", "11:00", RentalStatus.Pending),
    ];
    const mondayClass = BASE_RULES.map((r) => (r.id === "am-1" ? { ...r, end: "15:00" } : r));
    expect(ids({ before: BASE_RULES, after: mondayClass }, [started])).toEqual([]);
    // b already clashed with a, so only a is broken by the maintenance block.
    expect(ids({ before: BASE_RULES, after: [...BASE_RULES, MAINT_1205] }, clashing)).toEqual(["a"]);
  });
});
