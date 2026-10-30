import { describe, expect, it } from "vitest";
import {
  conflictInfo,
  homeKpis,
  paymentTag,
  rentalCardSubtitle,
  selectRentalsForDate,
} from "@/server/logic/home-selectors";
import { todayIso } from "@/server/logic/date";
import { paymentMethodLabelOrDash, paymentStateToLabel } from "@/server/supabase/codecs";
import { PaymentMethod, PaymentState, RentalStatus } from "@/server/types/home";
import { makeRental } from "@/server/logic/test-fixtures";

describe("首頁", () => {
  it("H-1: 今日租借只列已登記，跨日的兩天都出現", () => {
    const crossMidnight = makeRental({ id: "x", date: "2026-10-16", start: "22:30", end: "00:30", isCrossMidnight: true, status: RentalStatus.Registered });
    const pending = makeRental({ id: "p", date: "2026-10-16", status: RentalStatus.Pending });
    expect(selectRentalsForDate([crossMidnight, pending], "2026-10-16").map((r) => r.id)).toEqual(["x"]);
    expect(selectRentalsForDate([crossMidnight, pending], "2026-10-17").map((r) => r.id)).toEqual(["x"]);
  });

  it.each([
    { state: PaymentState.Paid, tag: "已付款" },
    { state: PaymentState.Unpaid, tag: "未付款" },
    { state: PaymentState.NotRequired, tag: "無需付款" },
  ])("HM13: 付款狀態 $state → $tag", ({ state, tag }) => {
    expect(paymentTag(makeRental({ date: "2026-10-06", paymentState: state }))).toBe(tag);
  });
});

describe("今日租借卡片", () => {
  it("HM12: 時段 · 教室縮寫 · 用途，不重複寫日期", () => {
    const rental = makeRental({ date: "2026-10-10", start: "14:00", end: "15:00", room: "B", purposeLabel: "舞蹈" });
    expect(rentalCardSubtitle(rental)).toBe("14:00–15:00 · B · 舞蹈");
  });

  it("HM14: 跨日的時段標出（跨日）", () => {
    const rental = makeRental({ date: "2026-10-14", start: "22:00", end: "01:00", isCrossMidnight: true, room: "A", purposeLabel: "私課" });
    expect(rentalCardSubtitle(rental)).toBe("22:00–01:00（跨日） · A · 私課");
  });
});

describe("列表顯示", () => {
  it("T-列表-3: 付款方式空時顯示「—」，付款狀態顯示中文", () => {
    expect(paymentMethodLabelOrDash(null)).toBe("—");
    expect(paymentMethodLabelOrDash("transfer")).toBe("轉帳");
    expect(paymentStateToLabel("unpaid")).toBe("未付款");
    expect(paymentStateToLabel("paid")).toBe("已付款");
    expect(paymentStateToLabel("not_required")).toBe("無需付款");
  });

  it("T-列表-4: 待確認、待付款之間重疊標撞單第 N 位；延期、取消、完成、已登記不標", () => {
    const first = makeRental({ id: "first", date: "2026-10-06", status: RentalStatus.Pending, createdAt: "2026-10-01T00:00:00Z" });
    const second = makeRental({ id: "second", date: "2026-10-06", status: RentalStatus.AwaitingPayment, createdAt: "2026-10-02T00:00:00Z" });
    const others = [RentalStatus.Postponed, RentalStatus.Cancelled, RentalStatus.Completed, RentalStatus.Registered].map((status) =>
      makeRental({ id: status, date: "2026-10-06", status, createdAt: "2026-09-01T00:00:00Z" }),
    );
    const list = [first, second, ...others];
    expect(conflictInfo(first, list)).toBe(1);
    expect(conflictInfo(second, list)).toBe(2);
    for (const other of others) expect(conflictInfo(other, list)).toBeNull();
  });
});

describe("今天", () => {
  it("F-日期-2: 「今天」用台北時間算（UTC 前一天 17:00 已經是台北的隔天）", () => {
    expect(todayIso(new Date("2026-10-09T17:00:00Z"))).toBe("2026-10-10");
    expect(todayIso(new Date("2026-10-09T15:59:00Z"))).toBe("2026-10-09");
  });
});

describe("首頁數字卡", () => {
  const day = "2026-10-14";
  const registered = (id: string, extra: Parameters<typeof makeRental>[0]) =>
    makeRental({ id, status: RentalStatus.Registered, ...extra });

  it("HM05: 租借場次是那天的已登記租借筆數", () => {
    const dayRentals = [registered("a", { date: day }), registered("b", { date: day, start: "10:00", end: "11:00" })];
    expect(homeKpis(dayRentals, dayRentals).rentalCount).toBe(2);
  });

  it("HM06: 現場待收只加總「現場繳費」且未付款的金額", () => {
    const dayRentals = [
      registered("transfer-due", { date: day, paymentMethod: PaymentMethod.Transfer, paymentState: PaymentState.Unpaid, amount: 500 }),
      registered("onsite-due", { date: day, paymentMethod: PaymentMethod.OnSite, paymentState: PaymentState.Unpaid, amount: 650 }),
      registered("onsite-paid", { date: day, paymentMethod: PaymentMethod.OnSite, paymentState: PaymentState.Paid, amount: 250 }),
      registered("free", { date: day, paymentMethod: null, paymentState: PaymentState.NotRequired, amount: 0 }),
    ];
    expect(homeKpis(dayRentals, dayRentals).onSiteDue).toBe(650);
  });

  it("HM08: 預約追蹤只算今天以後的「待確認」", () => {
    const future = "2099-01-01";
    const all = [
      makeRental({ id: "p1", date: future, status: RentalStatus.Pending }),
      makeRental({ id: "p2", date: future, room: "B", status: RentalStatus.Pending }),
      makeRental({ id: "awaiting", date: future, start: "12:00", end: "13:00", status: RentalStatus.AwaitingPayment }),
      makeRental({ id: "past", date: "2000-01-01", status: RentalStatus.Pending }),
    ];
    expect(homeKpis([], all).pendingCount).toBe(2);
  });

  it("HM09: 其中撞單的筆數只數「待確認」那些", () => {
    const future = "2099-01-01";
    const all = [
      makeRental({ id: "c1", date: future, status: RentalStatus.Pending, createdAt: "2026-01-01T00:00:00Z" }),
      makeRental({ id: "c2", date: future, status: RentalStatus.Pending, createdAt: "2026-01-02T00:00:00Z" }),
      makeRental({ id: "c3", date: future, status: RentalStatus.AwaitingPayment, createdAt: "2026-01-03T00:00:00Z" }),
      makeRental({ id: "alone", date: future, room: "B", status: RentalStatus.Pending }),
    ];
    const kpis = homeKpis([], all);
    expect(kpis.pendingCount).toBe(3);
    expect(kpis.pendingConflicts).toBe(2);
  });
});
