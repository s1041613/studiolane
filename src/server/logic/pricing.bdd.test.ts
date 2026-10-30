import { describe, expect, it } from "vitest";
import { calculateCustomerPrice, calculateRentalPrice, hourlyRate, quoteSlot } from "@/server/logic/pricing";
import type { PricingPlan, QuoteContext } from "@/server/logic/pricing";
import type { RenterSelection, SlotDraft } from "@/server/logic/booking";
import type { PurposeSetting } from "@/server/logic/purpose-rules";
import { SAMPLE_PLANS, SAMPLE_PURPOSE_SETTINGS, STAFF, TEACHER } from "@/server/logic/test-fixtures";
import { GENERAL, SEED_PLANS, STAFF_PLAN, TEACHER_PLAN, AXING_PLAN, LULU_PLAN, person } from "@/server/logic/__fixtures__/pricing-plans";

const pricing: QuoteContext = { roster: [TEACHER, STAFF], plans: SAMPLE_PLANS, purposeSettings: SAMPLE_PURPOSE_SETTINGS };

const teacher: RenterSelection = { type: "roster", id: TEACHER.id, name: TEACHER.name, role: "teacher" };
const staff: RenterSelection = { type: "roster", id: STAFF.id, name: STAFF.name, role: "staff" };
const customer: RenterSelection = { type: "customer", name: "王小明" };

function slot(start: string, end: string, isCrossMidnight = false): SlotDraft {
  return { date: "2026-10-06", start, end, isCrossMidnight };
}

describe("金額怎麼算", () => {
  it.each([
    { rate: 500, start: "10:00", end: "10:45", amount: 375 },
    { rate: 500, start: "10:00", end: "11:30", amount: 750 },
    { rate: 1000, start: "10:00", end: "10:10", amount: 167 },
    { rate: 450, start: "22:30", end: "00:30", amount: 900 },
  ])("M-4: 費率 $rate × $start–$end = $amount", ({ rate, start, end, amount }) => {
    const plans: PricingPlan[] = [{ id: "p", category: "teacher", appliesTo: "", roomARate: rate, roomBRate: 1, archivedAt: null }];
    const result = calculateRentalPrice("t", "A", start, end, {
      roster: [{ ...TEACHER, id: "t", pricingPlanId: "p" }],
      plans,
    });
    expect(result).toMatchObject({ ok: true, amount });
  });

  it("M-4: 客戶方案 1250 × 10:00–12:00 = 2500", () => {
    expect(calculateCustomerPrice("A", "10:00", "12:00", pricing)).toMatchObject({ ok: true, amount: 2500 });
  });

  it("U09 / T09: 一般用途照方案：老師 A 間 2 小時舞蹈 = 2 × 500", () => {
    expect(quoteSlot({ renter: teacher, purpose: "dance", room: "A", slot: slot("14:00", "16:00") }, pricing)).toEqual({
      ok: true, hours: 2, amount: 1000,
    });
  });

  // M-1: 展演 is free through its 0／0 special price, and only teachers may
  // book it (the validation rejects anyone else).
  it("M-1 / U10 / T09: 展演老師用特別價 0 元", () => {
    expect(quoteSlot({ renter: teacher, purpose: "performance", room: "A", slot: slot("10:00", "12:00") }, pricing)).toEqual({
      ok: true, hours: 2, amount: 0,
    });
  });

  it("U13 / T09: 作品班老師用特別價 0 元", () => {
    expect(quoteSlot({ renter: teacher, purpose: "workshop", room: "A", slot: slot("10:00", "12:00") }, pricing)).toEqual({
      ok: true, hours: 2, amount: 0,
    });
  });

  it("T09 / R14: 指定價格就用指定價格，不看方案（A、B 各自的價）", () => {
    const settings: PurposeSetting[] = SAMPLE_PURPOSE_SETTINGS.map((s) =>
      s.purpose === "dance" ? { ...s, rolePricing: { teacher: { mode: "price", roomA: 500, roomB: 200 } } } : s,
    );
    const ctx = { ...pricing, purposeSettings: settings };
    expect(quoteSlot({ renter: teacher, purpose: "dance", room: "A", slot: slot("10:00", "12:00") }, ctx)).toMatchObject({ amount: 1000 });
    // customer keeps its own plan rate: dance's pricing is only set for teacher.
    expect(quoteSlot({ renter: customer, purpose: "dance", room: "B", slot: slot("10:00", "12:00") }, ctx)).toMatchObject({ amount: 1200 });
  });

  // M-2: no special price — the staff plan is 0／0.
  it.each(["front_desk", "photography"] as const)("M-2 / U12 / T09: 櫃檯的 %s 照櫃檯價 0 元", (purpose) => {
    expect(quoteSlot({ renter: staff, purpose, room: "B", slot: slot("10:00", "12:00") }, pricing)).toEqual({
      ok: true, hours: 2, amount: 0,
    });
  });

  it("M-2: 櫃檯價調成非 0 時，櫃檯使用就跟著收費（沒有特別價）", () => {
    const plans = SAMPLE_PLANS.map((p) => (p.id === "plan-staff" ? { ...p, roomBRate: 100 } : p));
    expect(quoteSlot({ renter: staff, purpose: "front_desk", room: "B", slot: slot("10:00", "12:00") }, { ...pricing, plans })).toEqual({
      ok: true, hours: 2, amount: 200,
    });
  });

  it("M-3: 名單上的人用自己的方案；外部客戶用客戶方案", () => {
    expect(quoteSlot({ renter: teacher, purpose: "dance", room: "A", slot: slot("10:00", "11:00") }, pricing)).toEqual({
      ok: true, hours: 1, amount: 500,
    });
    expect(quoteSlot({ renter: customer, purpose: "dance", room: "B", slot: slot("10:00", "11:00") }, pricing)).toEqual({
      ok: true, hours: 1, amount: 600,
    });
  });

  it("M-5: 費率只看人＋教室＋用途，跨日一樣照小時算", () => {
    expect(
      quoteSlot({ renter: teacher, purpose: "dance", room: "B", slot: slot("22:30", "00:30", true) }, pricing),
    ).toEqual({ ok: true, hours: 2, amount: 500 });
  });

  it("S-7: 找不到價格方案 → 「找不到價格方案」", () => {
    const orphan: RenterSelection = { type: "roster", id: "ghost", name: "沒有方案", role: "teacher" };
    const result = quoteSlot(
      { renter: orphan, purpose: "dance", room: "A", slot: slot("10:00", "11:00") },
      { roster: [{ ...TEACHER, id: "ghost", pricingPlanId: "missing" }], plans: SAMPLE_PLANS, purposeSettings: SAMPLE_PURPOSE_SETTINGS },
    );
    expect(result).toMatchObject({ ok: false });
    expect(result.ok === false && result.reason).toContain("找不到價格方案");
  });

  // S-7: what skips the plan lookup is 指定價格, not a hard-coded free
  // purpose.
  it("S-7: 指定價格的用途不用查價格方案", () => {
    const result = quoteSlot(
      { renter: teacher, purpose: "performance", room: "A", slot: slot("10:00", "11:00") },
      { roster: [], plans: [], purposeSettings: SAMPLE_PURPOSE_SETTINGS },
    );
    expect(result).toEqual({ ok: true, hours: 1, amount: 0 });
  });

  it("T09: hourlyRate 給付款判斷用：0 元 → 不需付款", () => {
    expect(hourlyRate({ renter: staff, purpose: "front_desk", room: "A" }, pricing)).toEqual({ ok: true, rate: 0 });
    expect(hourlyRate({ renter: teacher, purpose: "dance", room: "B" }, pricing)).toEqual({ ok: true, rate: 250 });
  });
});

describe("R12 / R13 / R15 / R16: 折扣照各自方案、總額才四捨五入、同用途不同身分不同價", () => {
  const demo_xiaoyu: RenterSelection = { type: "roster", id: "示範小雨", name: "示範小雨", role: "teacher" };
  const demo_star: RenterSelection = { type: "roster", id: "示範阿星", name: "示範阿星", role: "teacher" };
  const demo_lulu: RenterSelection = { type: "roster", id: "示範露露", name: "示範露露", role: "teacher" };
  const demo_kiki: RenterSelection = { type: "roster", id: "demo_kiki", name: "demo_kiki", role: "staff" };
  const xiaomei: RenterSelection = { type: "customer", name: "示範小美" };

  const ROSTER = [
    person("示範小雨", TEACHER_PLAN.id, { id: "示範小雨", role: "teacher" }),
    person("示範阿星", AXING_PLAN.id, { id: "示範阿星", role: "teacher" }),
    person("示範露露", LULU_PLAN.id, { id: "示範露露", role: "teacher" }),
    person("demo_kiki", STAFF_PLAN.id, { id: "demo_kiki", role: "staff" }),
  ];

  const PURPOSES: PurposeSetting[] = [
    {
      purpose: "yoga",
      allowedRoles: ["teacher", "staff", "customer"],
      rolePricing: { teacher: { mode: "discount", payPercent: 80 }, staff: { mode: "price", roomA: 100, roomB: 50 } },
      archivedAt: null,
    },
    {
      purpose: "aerobics",
      allowedRoles: ["teacher", "staff", "customer"],
      rolePricing: { staff: { mode: "discount", payPercent: 50 }, customer: { mode: "discount", payPercent: 85 } },
      archivedAt: null,
    },
    {
      purpose: "dance",
      allowedRoles: ["teacher", "staff", "customer"],
      rolePricing: { customer: { mode: "price", roomA: 500, roomB: 200 } },
      archivedAt: null,
    },
    {
      purpose: "performance",
      allowedRoles: ["teacher"],
      rolePricing: { teacher: { mode: "price", roomA: 0, roomB: 0 } },
      archivedAt: null,
    },
  ];

  const ctx: QuoteContext = { roster: ROSTER, plans: [...SEED_PLANS, GENERAL], purposeSettings: PURPOSES };

  const oneHour: SlotDraft = { date: "2026-10-20", start: "10:00", end: "11:00", isCrossMidnight: false };
  const ninetyMin: SlotDraft = { date: "2026-10-20", start: "10:00", end: "11:30", isCrossMidnight: false };
  const twoHours: SlotDraft = { date: "2026-10-20", start: "10:00", end: "12:00", isCrossMidnight: false };

  // §7 acceptance table, A01–A11 (A12 is "選不到" — covered by purpose-rules tests).
  it("A01: 示範小雨（老師價）瑜伽（折扣 8）A・2 小時 = 500 × 0.8 × 2 = 800", () => {
    expect(quoteSlot({ renter: demo_xiaoyu, purpose: "yoga", room: "A", slot: twoHours }, ctx)).toMatchObject({ amount: 800 });
  });

  it("A02: 示範阿星（專屬價一）瑜伽（折扣 8）A・2 小時 = 450 × 0.8 × 2 = 720", () => {
    expect(quoteSlot({ renter: demo_star, purpose: "yoga", room: "A", slot: twoHours }, ctx)).toMatchObject({ amount: 720 });
  });

  it("A03: 示範露露（專屬價二）瑜伽（折扣 8）B・1.5 小時 = 200 × 0.8 × 1.5 = 240", () => {
    expect(quoteSlot({ renter: demo_lulu, purpose: "yoga", room: "B", slot: ninetyMin }, ctx)).toMatchObject({ amount: 240 });
  });

  it("A04: 示範小雨（老師價）有氧（方案價格）A・2 小時 = 500 × 2 = 1,000", () => {
    expect(quoteSlot({ renter: demo_xiaoyu, purpose: "aerobics", room: "A", slot: twoHours }, ctx)).toMatchObject({ amount: 1000 });
  });

  it("A05: 示範阿星（專屬價一）展演（指定 0／0）A・2 小時 = 0", () => {
    const result = quoteSlot({ renter: demo_star, purpose: "performance", room: "A", slot: twoHours }, ctx);
    expect(result).toMatchObject({ ok: true, amount: 0 });
  });

  it("A06: demo_kiki（櫃檯價）瑜伽（指定 100／50）A・2 小時 = 100 × 2 = 200", () => {
    expect(quoteSlot({ renter: demo_kiki, purpose: "yoga", room: "A", slot: twoHours }, ctx)).toMatchObject({ amount: 200 });
  });

  it("A07: demo_kiki（櫃檯價）有氧（折扣 5）A・2 小時 = 0 × 0.5 × 2 = 0", () => {
    const result = quoteSlot({ renter: demo_kiki, purpose: "aerobics", room: "A", slot: twoHours }, ctx);
    expect(result).toMatchObject({ ok: true, amount: 0 });
  });

  it("A08: demo_kiki（櫃檯價）舞蹈（方案價格）A・2 小時 = 0 × 2 = 0", () => {
    const result = quoteSlot({ renter: demo_kiki, purpose: "dance", room: "A", slot: twoHours }, ctx);
    expect(result).toMatchObject({ ok: true, amount: 0 });
  });

  it("A09: 示範小美（一般價）瑜伽（方案價格）A・2 小時 = 1,250 × 2 = 2,500", () => {
    expect(quoteSlot({ renter: xiaomei, purpose: "yoga", room: "A", slot: twoHours }, ctx)).toMatchObject({ amount: 2500 });
  });

  it("A10 / R13: 示範小美（一般價）有氧（折扣 8.5）B・1.5 小時 = 610 × 0.85 × 1.5 = 777.75 → 778（總額才四捨五入）", () => {
    expect(quoteSlot({ renter: xiaomei, purpose: "aerobics", room: "B", slot: ninetyMin }, ctx)).toMatchObject({ amount: 778 });
  });

  it("A11: 示範小美（一般價）舞蹈（指定 500／200）A・2 小時 = 500 × 2 = 1,000", () => {
    expect(quoteSlot({ renter: xiaomei, purpose: "dance", room: "A", slot: twoHours }, ctx)).toMatchObject({ amount: 1000 });
  });

  it("R15: 同一用途，不同身分不同價 — 瑜伽 A・1 小時: 示範小雨 400（折扣）、示範小美 1,250（方案價格）、demo_kiki 100（指定），demo_kiki 不需付款", () => {
    expect(quoteSlot({ renter: demo_xiaoyu, purpose: "yoga", room: "A", slot: oneHour }, ctx)).toMatchObject({ amount: 400 });
    expect(quoteSlot({ renter: xiaomei, purpose: "yoga", room: "A", slot: oneHour }, ctx)).toMatchObject({ amount: 1250 });
    expect(quoteSlot({ renter: demo_kiki, purpose: "yoga", room: "A", slot: oneHour }, ctx)).toMatchObject({ amount: 100 });
  });

  // R16's 最低 1 折 floor is enforced by payPercentFromInput at input time
  // (purpose-pricing.test.ts), not by hourlyRate — this only checks that a
  // non-zero payPercent never rounds the hourly rate itself down to 0.
  it("R16: 折扣的費率不會因為計算中途四捨五入而變成 0", () => {
    expect(hourlyRate({ renter: demo_xiaoyu, purpose: "yoga", room: "A" }, ctx)).toMatchObject({ rate: 400 });
  });
});
