import { describe, expect, it } from "vitest";
import { findBookingConflicts, isFullyAcknowledged } from "@/server/logic/booking-conflicts";
import type { RenterSelection, SlotDraft } from "@/server/logic/booking";
import { RentalStatus } from "@/server/types/home";
import { STAFF, TEACHER, makeRental } from "@/server/logic/test-fixtures";

// 示範小明 is the
// renter submitting, 示範小華 holds the rival booking.
const xiaoming: RenterSelection = { type: "roster", id: TEACHER.id, name: TEACHER.name, role: "teacher" };
const customer: RenterSelection = { type: "customer", name: "示範客戶" };

const SLOT: SlotDraft = { date: "2031-03-05", start: "19:00", end: "20:00", isCrossMidnight: false };

const rivalPending = (overrides = {}) =>
  makeRental({
    id: "rival-1",
    room: "A",
    date: "2031-03-05",
    start: "19:00",
    end: "20:00",
    status: RentalStatus.Pending,
    renterType: "roster",
    renterId: STAFF.id,
    person: STAFF.name,
    ...overrides,
  });

describe("findBookingConflicts", () => {
  it("情境1: 時段沒人用 → 沒有衝突", () => {
    expect(findBookingConflicts([SLOT], "A", xiaoming, [])).toEqual([]);
  });

  it("情境2: 別人重疊的待確認預約 → 回報日期、時間、租借人、狀態", () => {
    const conflicts = findBookingConflicts(
      [{ ...SLOT, start: "19:30", end: "20:30" }],
      "A",
      xiaoming,
      [rivalPending()],
    );
    expect(conflicts).toEqual([
      { id: "rival-1", date: "2031-03-05", start: "19:00", end: "20:00", renterName: STAFF.name, status: RentalStatus.Pending },
    ]);
  });

  it("情境3: 看過的衝突 id 都在 acknowledgedIds 裡 → 視為已確認", () => {
    const conflicts = findBookingConflicts([SLOT], "A", xiaoming, [rivalPending()]);
    expect(isFullyAcknowledged(conflicts, ["rival-1"])).toBe(true);
  });

  it("情境5: 確認視窗開著時多了一筆新衝突 → 舊的 acknowledgedIds 不夠，要再確認一次", () => {
    const secondRival = rivalPending({ id: "rival-2" });
    const conflicts = findBookingConflicts([SLOT], "A", xiaoming, [rivalPending(), secondRival]);
    // Only rival-1 was acknowledged; rival-2 showed up after.
    expect(isFullyAcknowledged(conflicts, ["rival-1"])).toBe(false);
    expect(conflicts.map((c) => c.id).sort()).toEqual(["rival-1", "rival-2"]);
  });

  it("情境7: 同一個人自己的重疊預約不算衝突（S-8 的欄位錯誤另外擋）", () => {
    const own = rivalPending({ renterType: "roster", renterId: TEACHER.id, person: TEACHER.name });
    expect(findBookingConflicts([SLOT], "A", xiaoming, [own])).toEqual([]);
  });

  it("情境7: 客戶用名字比對自己的預約，不算衝突", () => {
    const own = rivalPending({ renterType: "customer", renterId: null, person: "示範客戶" });
    expect(findBookingConflicts([SLOT], "A", customer, [own])).toEqual([]);
  });

  it("情境8: 已取消的預約不算衝突", () => {
    const cancelled = rivalPending({ status: RentalStatus.Cancelled });
    expect(findBookingConflicts([SLOT], "A", xiaoming, [cancelled])).toEqual([]);
  });

  it("情境8: 已完成的預約不算衝突", () => {
    const completed = rivalPending({ status: RentalStatus.Completed });
    expect(findBookingConflicts([SLOT], "A", xiaoming, [completed])).toEqual([]);
  });

  it("情境9: 一次送多個日期，只有一天有衝突 → 衝突清單只列那一筆", () => {
    const slots: SlotDraft[] = [
      { date: "2031-03-05", start: "19:00", end: "20:00", isCrossMidnight: false },
      { date: "2031-03-12", start: "19:00", end: "20:00", isCrossMidnight: false },
      { date: "2031-03-19", start: "19:00", end: "20:00", isCrossMidnight: false },
    ];
    const conflicts = findBookingConflicts(slots, "A", xiaoming, [rivalPending({ date: "2031-03-12" })]);
    expect(conflicts).toEqual([
      { id: "rival-1", date: "2031-03-12", start: "19:00", end: "20:00", renterName: STAFF.name, status: RentalStatus.Pending },
    ]);
  });

  it("不同教室不算衝突", () => {
    const otherRoom = rivalPending({ room: "B" });
    expect(findBookingConflicts([SLOT], "A", xiaoming, [otherRoom])).toEqual([]);
  });

  it("同一筆衝突重疊到多個送出的時段只回報一次（依 id 去重）", () => {
    const slots: SlotDraft[] = [
      { date: "2031-03-05", start: "19:00", end: "20:00", isCrossMidnight: false },
      { date: "2031-03-05", start: "19:30", end: "20:30", isCrossMidnight: false },
    ];
    expect(findBookingConflicts(slots, "A", xiaoming, [rivalPending()])).toHaveLength(1);
  });
});

describe("isFullyAcknowledged", () => {
  it("沒有衝突時視為已確認", () => {
    expect(isFullyAcknowledged([], [])).toBe(true);
  });
});
