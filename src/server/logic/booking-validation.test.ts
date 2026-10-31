import { describe, expect, it } from "vitest";
import { orderedErrorFields, validateBookingDraft } from "@/server/logic/booking-validation";
import type { BookingValidationContext } from "@/server/logic/booking-validation";
import type { BookingDraft, RenterSelection, SlotDraft } from "@/server/logic/booking";
import { PaymentMethod, PaymentState, RentalStatus } from "@/server/types/home";
import { SAMPLE_PLANS, SAMPLE_PURPOSE_SETTINGS, SAMPLE_RULES, STAFF, TEACHER, makeRental } from "@/server/logic/test-fixtures";

const teacher: RenterSelection = { type: "roster", id: TEACHER.id, name: TEACHER.name, role: "teacher" };
const staff: RenterSelection = { type: "roster", id: STAFF.id, name: STAFF.name, role: "staff" };
const customer: RenterSelection = { type: "customer", name: "王小明" };

// Tuesday 2026-10-06, room B is open 14:00–22:00.
const SLOT: SlotDraft = { date: "2026-10-06", start: "15:00", end: "17:00", isCrossMidnight: false };

// "Now" sits before every slot in this file unless a test moves it (S-9).
const BEFORE_ALL_SLOTS = new Date("2026-10-01T00:00:00+08:00");

function context(overrides: Partial<BookingValidationContext> = {}): BookingValidationContext {
  return {
    rules: SAMPLE_RULES,
    existingRentals: [],
    roster: [TEACHER, STAFF],
    plans: SAMPLE_PLANS,
    purposeSettings: SAMPLE_PURPOSE_SETTINGS,
    now: BEFORE_ALL_SLOTS,
    ...overrides,
  };
}

function draft(overrides: Partial<BookingDraft> = {}): BookingDraft {
  return { room: "B", renter: teacher, slots: [SLOT], purpose: "dance", payment: "transfer", note: "", ...overrides };
}

describe("送出時的檢查", () => {
  it("S-1: 沒填的必填欄位全部一次回報", () => {
    const result = validateBookingDraft(draft({ renter: null, slots: [], purpose: null }), context());
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { renter: "請選擇租借人", dates: "請至少選一天", purpose: "請選擇用途" },
    });
  });

  it("S-1 / F-時間-6: 時段卡沒填時間", () => {
    const result = validateBookingDraft(draft({ slots: [{ ...SLOT, start: "", end: "" }] }), context());
    expect(result).toMatchObject({ ok: false, fieldErrors: { "slots.0": "請填開始和結束時間" } });
  });

  it("S-1 / F-付款-3: 收費用途沒有付款方式 → 「請選擇付款方式」", () => {
    const result = validateBookingDraft(draft({ payment: null }), context());
    expect(result).toMatchObject({ ok: false, fieldErrors: { payment: "請選擇付款方式" } });
  });

  it("S-2: 跨日勾選和時間前後不一致", () => {
    const result = validateBookingDraft(draft({ slots: [{ ...SLOT, isCrossMidnight: true }] }), context());
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { "slots.0": "已勾選跨日，結束時間應該早於開始時間" },
    });
  });

  // S-3: 作品班、私課 are open to teachers now; what closes a purpose is
  // archiving it on the purposes page.
  it("S-3 / T10: 用途在表單打開後被停用 → 「這個用途已停用」", () => {
    const settings = SAMPLE_PURPOSE_SETTINGS.map((s) =>
      s.purpose === "private_lesson" ? { ...s, archivedAt: "2026-10-01T00:00:00Z" } : s,
    );
    const result = validateBookingDraft(draft({ purpose: "private_lesson", payment: null }), context({ purposeSettings: settings }));
    expect(result).toMatchObject({ ok: false, fieldErrors: { purpose: "這個用途已停用" } });
  });

  it.each(["workshop", "private_lesson"] as const)("T10: 老師可以約 %s，0 元不需付款", (purpose) => {
    const result = validateBookingDraft(draft({ purpose, payment: null }), context());
    expect(result).toMatchObject({ ok: true, paymentMethod: null, paymentState: PaymentState.NotRequired });
  });

  it("U14 / T10: 客戶的預約帶展演直接送出 → 「僅限 老師」", () => {
    const result = validateBookingDraft(draft({ renter: customer, purpose: "performance", payment: null }), context());
    expect(result).toMatchObject({ ok: false, fieldErrors: { purpose: "僅限 老師" } });
  });

  it("T10: 檢查讀設定而不是寫死的清單：開放展演給客戶後就能約", () => {
    const settings = SAMPLE_PURPOSE_SETTINGS.map((s) =>
      s.purpose === "performance" ? { ...s, allowedRoles: [...s.allowedRoles, "customer" as const] } : s,
    );
    const result = validateBookingDraft(draft({ renter: customer, purpose: "performance" }), context({ purposeSettings: settings }));
    // E-5 U02: the newly opened role starts at 方案價格, not the teachers' 0／0 (B 間 600 × 2).
    expect(result).toMatchObject({ ok: true, paymentState: PaymentState.Unpaid, slots: [{ amount: 1200 }] });
  });

  it("S-4: server 用 renter_id 重新查身分，不相信前端傳來的 role", () => {
    const forged: RenterSelection = { type: "roster", id: TEACHER.id, name: TEACHER.name, role: "staff" };
    const result = validateBookingDraft(draft({ renter: forged, purpose: "front_desk", payment: null }), context());
    expect(result).toMatchObject({ ok: false, fieldErrors: { purpose: "僅限 櫃檯" } });
  });

  it("S-4: id 合法但名字被偽造 → 用名單上的名字，不信前端送的名字", () => {
    const forged: RenterSelection = { type: "roster", id: TEACHER.id, name: "偽造的名字", role: "teacher" };
    const result = validateBookingDraft(draft({ renter: forged }), context());
    expect(result).toMatchObject({ ok: true, renter: { id: TEACHER.id, name: TEACHER.name, role: "teacher" } });
  });

  it("人員名單 R21: 租借人已停用 → 「這位人員已停用」", () => {
    const archived = { ...TEACHER, archivedAt: "2026-10-01T00:00:00Z" };
    const result = validateBookingDraft(draft(), context({ roster: [archived, STAFF] }));
    expect(result).toMatchObject({ ok: false, fieldErrors: { renter: "這位人員已停用" } });
  });

  it("S-4: 外部客戶不能選櫃檯使用", () => {
    const result = validateBookingDraft(draft({ renter: customer, purpose: "front_desk", payment: null }), context());
    expect(result).toMatchObject({ ok: false, fieldErrors: { purpose: "僅限 櫃檯" } });
  });

  it("用途不再有專屬時段：有氧在平日下午也能約", () => {
    const aerobicsA = draft({ room: "A", purpose: "aerobics", slots: [SLOT] });
    expect(validateBookingDraft(aerobicsA, context())).toMatchObject({ ok: true });
  });

  it("S-6 / S-錯誤-5: 跟已登記的預約重疊 → 那張時段卡顯示「14:30–15:30 已有人預約」", () => {
    const registered = makeRental({ room: "B", date: "2026-10-06", start: "14:30", end: "15:30", status: RentalStatus.Registered });
    const result = validateBookingDraft(draft({ slots: [{ ...SLOT, start: "14:00", end: "16:00" }] }), context({ existingRentals: [registered] }));
    expect(result).toMatchObject({ ok: false, fieldErrors: { "slots.0": "14:30–15:30 已有人預約" } });
  });

  it("S-6: 待確認的預約不擋", () => {
    const pending = makeRental({ room: "B", date: "2026-10-06", start: "14:30", end: "15:30", status: RentalStatus.Pending });
    expect(validateBookingDraft(draft(), context({ existingRentals: [pending] })).ok).toBe(true);
  });

  it("S-7: 找不到價格方案 → 錯誤顯示在那張時段卡", () => {
    const result = validateBookingDraft(draft(), context({ plans: [] }));
    expect(result).toMatchObject({ ok: false });
    expect(result.ok === false && result.fieldErrors["slots.0"]).toContain("找不到價格方案");
  });
});

describe("重複預約與已過去的時段", () => {
  const ownPending = (overrides = {}) =>
    makeRental({
      room: "B", date: "2026-10-06", start: "16:00", end: "18:00", status: RentalStatus.Pending,
      renterType: "roster", renterId: TEACHER.id, person: TEACHER.name, ...overrides,
    });

  it("S-8: 跟自己待確認的預約重疊 → 「你已經預約過這個時段」", () => {
    const result = validateBookingDraft(draft(), context({ existingRentals: [ownPending()] }));
    expect(result).toMatchObject({ ok: false, fieldErrors: { "slots.0": "你已經預約過這個時段" } });
  });

  it.each([RentalStatus.AwaitingPayment, RentalStatus.Registered])("S-8: 跟自己 %s 的預約重疊也擋", (status) => {
    const result = validateBookingDraft(draft(), context({ existingRentals: [ownPending({ status })] }));
    expect(result.ok).toBe(false);
  });

  it("S-8: 自己已取消／延期的預約不算", () => {
    const released = [RentalStatus.Cancelled, RentalStatus.Postponed].map((status) => ownPending({ id: status, status }));
    expect(validateBookingDraft(draft(), context({ existingRentals: released })).ok).toBe(true);
  });

  it("S-8: 別人待確認的預約重疊不擋（等確認時用撞單視窗處理）", () => {
    const someoneElse = ownPending({ renterId: STAFF.id, person: STAFF.name });
    expect(validateBookingDraft(draft(), context({ existingRentals: [someoneElse] })).ok).toBe(true);
  });

  it("S-8: 外部客戶用名字判斷是不是同一個人", () => {
    const customerBooking = ownPending({ renterType: "customer", renterId: null, person: "王小明" });
    const result = validateBookingDraft(draft({ renter: customer }), context({ existingRentals: [customerBooking] }));
    expect(result).toMatchObject({ ok: false, fieldErrors: { "slots.0": "你已經預約過這個時段" } });
  });

  it("S-8: 不同教室不算重複", () => {
    const otherRoom = ownPending({ room: "A" });
    expect(validateBookingDraft(draft(), context({ existingRentals: [otherRoom] })).ok).toBe(true);
  });

  it("S-9: 開始時間早於現在（台北時間）→ 「這個時段已經過去了」", () => {
    // SLOT is 2026-10-06 15:00–17:00 Taipei; now is 15:30 that day.
    const result = validateBookingDraft(draft(), context({ now: new Date("2026-10-06T15:30:00+08:00") }));
    expect(result).toMatchObject({ ok: false, fieldErrors: { "slots.0": "這個時段已經過去了" } });
  });

  it("S-9: 開始時間晚於現在可以訂", () => {
    const result = validateBookingDraft(draft(), context({ now: new Date("2026-10-06T14:59:00+08:00") }));
    expect(result.ok).toBe(true);
  });
});

describe("同一次送出裡的時段卡互相重疊", () => {
  it("兩張時段卡互相重疊 → 晚的那張卡顯示錯誤", () => {
    const second: SlotDraft = { date: "2026-10-06", start: "16:00", end: "18:00", isCrossMidnight: false };
    const result = validateBookingDraft(draft({ slots: [SLOT, second] }), context());
    expect(result).toMatchObject({ ok: false, fieldErrors: { "slots.1": "這個時段跟上面選的時段重複了" } });
  });

  it("兩張時段卡日期時間完全一樣 → 晚的那張卡顯示錯誤", () => {
    const result = validateBookingDraft(draft({ slots: [SLOT, { ...SLOT }] }), context());
    expect(result).toMatchObject({ ok: false, fieldErrors: { "slots.1": "這個時段跟上面選的時段重複了" } });
  });

  it("不重疊的兩張時段卡都能通過", () => {
    const second: SlotDraft = { date: "2026-10-07", start: "15:00", end: "17:00", isCrossMidnight: false };
    const result = validateBookingDraft(draft({ slots: [SLOT, second] }), context());
    expect(result.ok).toBe(true);
  });
});

describe("沒通過時", () => {
  it("S-錯誤-2: 回報有幾個地方需要處理", () => {
    const result = validateBookingDraft(draft({ renter: null, purpose: null, payment: null }), context());
    expect(result.ok === false && Object.keys(result.fieldErrors)).toHaveLength(2);
  });

  it("S-錯誤-3: 有問題的欄位照畫面順序排：租借人 → 教室 → 日期 → 時段卡 → 用途 → 付款方式", () => {
    expect(
      orderedErrorFields({ payment: "x", purpose: "x", "slots.1": "x", "slots.0": "x", renter: "x" }),
    ).toEqual(["renter", "slot-0", "slot-1", "purpose", "payment"]);
  });
});

describe("通過後寫入什麼", () => {
  it("S-寫入-1: 收費用途 → 表單選的付款方式＋未付款＋計算出的金額", () => {
    const result = validateBookingDraft(draft({ payment: "on_site" }), context());
    expect(result).toMatchObject({
      ok: true,
      paymentMethod: PaymentMethod.OnSite,
      paymentState: PaymentState.Unpaid,
      slots: [{ slot: SLOT, hours: 2, amount: 500 }],
    });
  });

  it("S-寫入-2: 0 元（櫃檯價 0／0）→ 付款方式空＋無需付款＋0 元（不管前端送了什麼付款方式）", () => {
    const result = validateBookingDraft(draft({ renter: staff, purpose: "front_desk", payment: "transfer" }), context());
    expect(result).toMatchObject({
      ok: true,
      paymentMethod: null,
      paymentState: PaymentState.NotRequired,
      slots: [{ slot: SLOT, hours: 2, amount: 0 }],
    });
  });

  it("S-寫入-2: 老師的展演用特別價 0 元 → 不需付款", () => {
    const result = validateBookingDraft(draft({ purpose: "performance", payment: null }), context());
    expect(result).toMatchObject({ ok: true, paymentMethod: null, paymentState: PaymentState.NotRequired });
  });

  it("U12: 櫃檯約舞蹈也照櫃檯價 0 元，不用選付款方式", () => {
    const result = validateBookingDraft(draft({ renter: staff, purpose: "dance", payment: null }), context());
    expect(result).toMatchObject({ ok: true, paymentMethod: null, paymentState: PaymentState.NotRequired });
  });
});
