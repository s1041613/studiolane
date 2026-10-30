import { describe, expect, it } from "vitest";
import { fail, ok } from "@/lib/result";
import {
  allowedActions,
  checkActionAllowed,
  conflictDialogRows,
  findRegisteredOverlaps,
  needsRefund,
  nextStatusOnConfirm,
  initialBookingFilters,
  planConfirm,
  selectBookingRows,
  withRefundNote,
} from "@/server/logic/bookings";
import { PaymentMethod, PaymentState, RentalStatus } from "@/server/types/home";
import { makeRental } from "@/server/logic/test-fixtures";

const paid = { paymentState: PaymentState.Paid };
const free = { paymentMethod: null, paymentState: PaymentState.NotRequired, amount: 0 };

describe("每個狀態有哪些按鈕", () => {
  it.each([
    { id: "T-按鈕-1", label: "待確認", rental: { status: RentalStatus.Pending }, actions: ["confirm", "postpone", "cancel"] },
    { id: "T-按鈕-1", label: "待確認（免費）", rental: { status: RentalStatus.Pending, ...free }, actions: ["confirm", "postpone", "cancel"] },
    { id: "T-按鈕-2", label: "待付款＋未付款", rental: { status: RentalStatus.AwaitingPayment }, actions: ["markPaid", "postpone", "cancel"] },
    { id: "T-按鈕-3", label: "已登記＋未付款", rental: { status: RentalStatus.Registered }, actions: ["markPaid", "postpone", "cancel"] },
    { id: "T-按鈕-4", label: "已登記＋已付款", rental: { status: RentalStatus.Registered, ...paid }, actions: ["markDone", "postpone", "cancel"] },
    { id: "T-按鈕-4", label: "已登記＋無需付款", rental: { status: RentalStatus.Registered, ...free }, actions: ["markDone", "postpone", "cancel"] },
    { id: "T-按鈕-5", label: "已完成", rental: { status: RentalStatus.Completed, ...paid }, actions: [] },
    { id: "T-按鈕-5", label: "延期", rental: { status: RentalStatus.Postponed }, actions: [] },
    { id: "T-按鈕-5", label: "已取消", rental: { status: RentalStatus.Cancelled }, actions: [] },
  ])("$id: $label → $actions", ({ rental, actions }) => {
    expect(allowedActions(makeRental({ date: "2026-10-06", ...rental }))).toEqual(actions);
  });

  it("T-按鈕: server 收到表上沒有的操作 → 「目前狀態不能〈操作〉」", () => {
    const completed = makeRental({ date: "2026-10-06", status: RentalStatus.Completed, ...paid });
    expect(checkActionAllowed(completed, "cancel")).toEqual(fail("FAILED_PRECONDITION", "目前狀態不能取消"));
    const pending = makeRental({ date: "2026-10-06", status: RentalStatus.Pending });
    expect(checkActionAllowed(pending, "markDone")).toEqual(fail("FAILED_PRECONDITION", "目前狀態不能標記完成"));
    expect(checkActionAllowed(pending, "confirm")).toEqual(ok());
  });
});

describe("確認", () => {
  it.each([
    { label: "現場", rental: { paymentMethod: PaymentMethod.OnSite }, next: RentalStatus.Registered },
    { label: "轉帳", rental: { paymentMethod: PaymentMethod.Transfer }, next: RentalStatus.AwaitingPayment },
    { label: "免費", rental: free, next: RentalStatus.Registered },
  ])("T-確認-1: $label → $next", ({ rental, next }) => {
    expect(nextStatusOnConfirm(makeRental({ date: "2026-10-06", ...rental }))).toBe(next);
  });

  const target = makeRental({ id: "target", date: "2026-10-06", start: "14:00", end: "16:00", createdAt: "2026-10-01T02:00:00Z" });

  it("T-確認-2: 沒有重疊 → 直接照 T-確認-1", () => {
    const other = makeRental({ id: "other", date: "2026-10-06", start: "16:00", end: "17:00" });
    expect(planConfirm(target, [target, other])).toEqual({
      kind: "confirm",
      nextStatus: RentalStatus.Registered,
      cancellations: [],
    });
  });

  it("T-確認-2 / T-確認-3: 同教室、時間重疊的待確認／待付款／已登記都列出來，依送出時間排序", () => {
    const pending = makeRental({ id: "pending", date: "2026-10-06", start: "15:00", end: "17:00", createdAt: "2026-10-01T03:00:00Z" });
    const awaiting = makeRental({ id: "awaiting", date: "2026-10-06", start: "13:00", end: "14:30", status: RentalStatus.AwaitingPayment, createdAt: "2026-10-01T01:00:00Z" });
    const registered = makeRental({ id: "registered", date: "2026-10-06", start: "15:30", end: "16:30", status: RentalStatus.Registered, createdAt: "2026-09-30T00:00:00Z" });
    const ignored = [
      makeRental({ id: "other-room", room: "B", date: "2026-10-06", start: "14:00", end: "16:00" }),
      makeRental({ id: "cancelled", date: "2026-10-06", start: "14:00", end: "16:00", status: RentalStatus.Cancelled }),
      makeRental({ id: "postponed", date: "2026-10-06", start: "14:00", end: "16:00", status: RentalStatus.Postponed }),
      makeRental({ id: "completed", date: "2026-10-06", start: "14:00", end: "16:00", status: RentalStatus.Completed }),
    ];
    const result = planConfirm(target, [target, pending, awaiting, registered, ...ignored]);
    expect(result.kind).toBe("conflicts");
    expect(result.kind === "conflicts" && result.conflicts.map((r) => r.id)).toEqual(["registered", "awaiting", "pending"]);
  });

  it("T-確認-4: 帶著同一份撞單名單確認 → 這筆往下走，其他全部取消；已付款且 > 0 的加退款備註", () => {
    const paidOther = makeRental({ id: "paid", date: "2026-10-06", start: "15:00", end: "17:00", status: RentalStatus.Registered, ...paid, amount: 1000, note: "老客人" });
    const unpaidOther = makeRental({ id: "unpaid", date: "2026-10-06", start: "13:00", end: "14:30" });
    const result = planConfirm(target, [target, paidOther, unpaidOther], ["paid", "unpaid"]);
    expect(result).toEqual({
      kind: "confirm",
      nextStatus: RentalStatus.Registered,
      cancellations: [
        { id: "paid", note: "老客人【需要退款】" },
        { id: "unpaid", note: "" },
      ],
    });
  });

  it("T-確認-4: 名單跟 server 重新算的不一樣（有人剛好也在操作）→ 回傳新的名單，不改資料", () => {
    const a = makeRental({ id: "a", date: "2026-10-06", start: "15:00", end: "17:00" });
    const b = makeRental({ id: "b", date: "2026-10-06", start: "13:00", end: "14:30" });
    const result = planConfirm(target, [target, a, b], ["a"]);
    expect(result.kind).toBe("conflicts");
  });

  it("T-確認-3: 撞單視窗把目前這筆和重疊的預約全部一起依送出時間排序，標出要保留的那筆", () => {
    const current = makeRental({ id: "current", date: "2026-10-06", createdAt: "2026-10-01T05:00:00Z" });
    const earlier = makeRental({ id: "earlier", date: "2026-10-06", createdAt: "2026-10-01T01:00:00Z" });
    const later = makeRental({ id: "later", date: "2026-10-06", createdAt: "2026-10-01T09:00:00Z" });
    expect(conflictDialogRows(current, [later, earlier]).map((r) => [r.rental.id, r.keep])).toEqual([
      ["earlier", false],
      ["current", true],
      ["later", false],
    ]);
  });

  it("T-確認-6: 轉帳的預約也在確認時處理撞單", () => {
    const transfer = makeRental({ id: "transfer", date: "2026-10-06", start: "14:00", end: "16:00", paymentMethod: PaymentMethod.Transfer });
    const other = makeRental({ id: "other", date: "2026-10-06", start: "15:00", end: "17:00" });
    expect(planConfirm(transfer, [transfer, other]).kind).toBe("conflicts");
  });
});

describe("標記已付款", () => {
  it("T-付款-2: 跟其他已登記的預約重疊時找出是哪一筆", () => {
    const target = makeRental({ id: "target", date: "2026-10-06", start: "14:00", end: "16:00", status: RentalStatus.AwaitingPayment });
    const registered = makeRental({ id: "registered", date: "2026-10-06", start: "15:00", end: "17:00", status: RentalStatus.Registered });
    const pending = makeRental({ id: "pending", date: "2026-10-06", start: "15:00", end: "17:00" });
    expect(findRegisteredOverlaps(target, [target, registered, pending]).map((r) => r.id)).toEqual(["registered"]);
  });
});

describe("標記完成", () => {
  it("T-完成-1: 已登記＋已付款、已登記＋無需付款可以完成", () => {
    expect(checkActionAllowed(makeRental({ date: "2026-10-06", status: RentalStatus.Registered, ...paid }), "markDone")).toEqual(ok());
    expect(checkActionAllowed(makeRental({ date: "2026-10-06", status: RentalStatus.Registered, ...free }), "markDone")).toEqual(ok());
  });

  it("T-完成-2: 已登記＋未付款不能完成", () => {
    expect(checkActionAllowed(makeRental({ date: "2026-10-06", status: RentalStatus.Registered }), "markDone").ok).toBe(false);
  });
});

describe("延期／取消", () => {
  it.each([RentalStatus.Pending, RentalStatus.AwaitingPayment, RentalStatus.Registered])("T-延取-1: %s 可以延期或取消", (status) => {
    const rental = makeRental({ date: "2026-10-06", status });
    expect(checkActionAllowed(rental, "postpone")).toEqual(ok());
    expect(checkActionAllowed(rental, "cancel")).toEqual(ok());
  });

  it.each([RentalStatus.Postponed, RentalStatus.Cancelled, RentalStatus.Completed])("T-延取-1: %s 是終點，不能再延期或取消", (status) => {
    const rental = makeRental({ date: "2026-10-06", status });
    expect(checkActionAllowed(rental, "postpone").ok).toBe(false);
    expect(checkActionAllowed(rental, "cancel").ok).toBe(false);
  });

  it("T-延取-3: 已付款且金額 > 0 需要退款，備註附加而不覆蓋", () => {
    expect(needsRefund(makeRental({ date: "2026-10-06", ...paid, amount: 1000 }))).toBe(true);
    expect(withRefundNote("老客人")).toBe("老客人【需要退款】");
    expect(withRefundNote("")).toBe("【需要退款】");
  });

  it.each([
    { label: "未付款", rental: { amount: 1000 } },
    { label: "無需付款", rental: free },
    { label: "已付款但金額 0", rental: { ...paid, amount: 0 } },
  ])("T-延取-4: $label 不需要退款", ({ rental }) => {
    expect(needsRefund(makeRental({ date: "2026-10-06", ...rental }))).toBe(false);
  });
});

describe("列表篩選", () => {
  it("T-列表-1: 付款方式篩選「無需付款」＝付款方式是空的", () => {
    const items = [
      makeRental({ id: "on-site", date: "2026-10-06", paymentMethod: PaymentMethod.OnSite }),
      makeRental({ id: "transfer", date: "2026-10-06", paymentMethod: PaymentMethod.Transfer }),
      makeRental({ id: "free", date: "2026-10-06", ...free }),
    ];
    expect(selectBookingRows(items, { pay: "none" }).map((r) => r.id)).toEqual(["free"]);
    expect(selectBookingRows(items, { pay: PaymentMethod.Transfer }).map((r) => r.id)).toEqual(["transfer"]);
  });

  const byStatus = [
    makeRental({ id: "pending", date: "2026-10-06", status: RentalStatus.Pending }),
    makeRental({ id: "awaiting", date: "2026-10-06", status: RentalStatus.AwaitingPayment }),
    makeRental({ id: "registered", date: "2026-10-06", status: RentalStatus.Registered }),
    makeRental({ id: "cancelled", date: "2026-10-06", status: RentalStatus.Cancelled }),
  ];

  it("T-列表-5: 狀態可以複選，列出勾選的任一狀態", () => {
    expect(
      selectBookingRows(byStatus, { statuses: [RentalStatus.Registered, RentalStatus.Cancelled] }).map((r) => r.id),
    ).toEqual(["registered", "cancelled"]);
  });

  it("T-列表-6: 一進來預設只看待確認（2026-10-15 改，原本含待付款）", () => {
    expect(initialBookingFilters().statuses).toEqual([RentalStatus.Pending]);
    expect(selectBookingRows(byStatus, { statuses: initialBookingFilters().statuses }).map((r) => r.id)).toEqual(["pending"]);
  });

  it("T-列表-7: 全部不勾 → 不篩狀態，列出全部", () => {
    expect(selectBookingRows(byStatus, { statuses: [] })).toHaveLength(4);
  });

  it("T-列表-2: 日期篩選包含跨日的隔天", () => {
    const crossMidnight = makeRental({ id: "x", date: "2026-10-16", start: "22:30", end: "00:30", isCrossMidnight: true });
    expect(selectBookingRows([crossMidnight], { from: "2026-10-17", to: "2026-10-17" }).map((r) => r.id)).toEqual(["x"]);
    expect(selectBookingRows([crossMidnight], { from: "2026-10-18" })).toEqual([]);
  });
});
