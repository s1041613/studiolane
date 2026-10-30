import { describe, expect, it } from "vitest";
import { calculateCustomerPrice, calculateRentalPrice } from "@/server/logic/pricing";
import type { PricingContext, RosterEntry, PricingPlan } from "@/server/logic/pricing";

function makeRoster(overrides: Partial<RosterEntry> = {}): RosterEntry {
  return {
    id: "roster-1",
    name: "測試老師",
    email: "test@example.com",
    phone: "",
    role: "teacher",
    pricingPlanId: "GENERAL",
    instagram: "",
    archivedAt: null,
    ...overrides,
  };
}

function makePlan(overrides: Partial<PricingPlan> = {}): PricingPlan {
  return {
    id: "GENERAL",
    category: "teacher",
    appliesTo: "",
    roomARate: 1200,
    roomBRate: 500,
    archivedAt: null,
    ...overrides,
  };
}

function ctx(roster: RosterEntry[], plans: PricingPlan[]): PricingContext {
  return { roster, plans };
}

describe("calculateRentalPrice against the BDD B4 scenario outline", () => {
  it.each([
    { plan: "常態老師", room: "A" as const, start: "10:00", end: "11:30", roomARate: 500, roomBRate: 250, expectedHours: 1.5, expectedAmount: 750 },
    { plan: "常態老師", room: "B" as const, start: "10:00", end: "11:30", roomARate: 500, roomBRate: 250, expectedHours: 1.5, expectedAmount: 375 },
    { plan: "特殊價格（示範阿星）", room: "A" as const, start: "10:00", end: "12:00", roomARate: 600, roomBRate: 250, expectedHours: 2, expectedAmount: 1200 },
    { plan: "特殊價格（示範露露）", room: "B" as const, start: "10:00", end: "12:00", roomARate: 600, roomBRate: 250, expectedHours: 2, expectedAmount: 500 },
    { plan: "一般", room: "A" as const, start: "10:00", end: "11:00", roomARate: 1200, roomBRate: 500, expectedHours: 1, expectedAmount: 1200 },
  ])("$plan × $room $start-$end", ({ room, start, end, roomARate, roomBRate, expectedHours, expectedAmount }) => {
    const roster = [makeRoster({ id: "r1", pricingPlanId: "PLAN" })];
    const plans = [makePlan({ id: "PLAN", roomARate, roomBRate })];
    const result = calculateRentalPrice("r1", room, start, end, ctx(roster, plans));
    expect(result).toEqual({ ok: true, hours: expectedHours, amount: expectedAmount });
  });

  it("selects the renter's pricing plan through the roster id -> plan join (D6: not by name)", () => {
    const roster = [
      makeRoster({ id: "xiao-weng", name: "示範小汪", pricingPlanId: "TEACHER" }),
      makeRoster({ id: "demo_star", name: "示範阿星", pricingPlanId: "SPECIAL_AXING" }),
    ];
    const plans = [
      makePlan({ id: "TEACHER", roomARate: 500, roomBRate: 250 }),
      makePlan({ id: "SPECIAL_AXING", roomARate: 600, roomBRate: 250 }),
    ];
    const result = calculateRentalPrice("demo_star", "A", "10:00", "12:00", ctx(roster, plans));
    expect(result).toEqual({ ok: true, hours: 2, amount: 1200 });
  });

  // 價格方案 P19 / T20: archiving a plan doesn't stop it pricing its people
  it("T20: still prices with an archived plan", () => {
    const roster = [makeRoster({ id: "r1", pricingPlanId: "OLD" })];
    const plans = [makePlan({ id: "OLD", roomARate: 500, archivedAt: "2026-10-01T00:00:00Z" })];
    const result = calculateRentalPrice("r1", "A", "10:00", "11:00", ctx(roster, plans));
    expect(result).toEqual({ ok: true, hours: 1, amount: 500 });
  });

  it("joins by id even when two roster members share the same display name (D6)", () => {
    const roster = [
      makeRoster({ id: "r1", name: "同名老師", pricingPlanId: "PLAN_A" }),
      makeRoster({ id: "r2", name: "同名老師", pricingPlanId: "PLAN_B" }),
    ];
    const plans = [
      makePlan({ id: "PLAN_A", roomARate: 100, roomBRate: 50 }),
      makePlan({ id: "PLAN_B", roomARate: 900, roomBRate: 400 }),
    ];
    const result = calculateRentalPrice("r2", "A", "10:00", "11:00", ctx(roster, plans));
    expect(result).toEqual({ ok: true, hours: 1, amount: 900 });
  });

  it("rolls a cross-midnight duration into the next day when computing hours", () => {
    const roster = [makeRoster({ id: "r1", pricingPlanId: "PLAN" })];
    const plans = [makePlan({ id: "PLAN", roomARate: 450, roomBRate: 200 })];
    const result = calculateRentalPrice("r1", "A", "22:30", "00:30", ctx(roster, plans));
    expect(result).toEqual({ ok: true, hours: 2, amount: 900 });
  });

  it("returns an error when the renter id is not found in the roster", () => {
    const result = calculateRentalPrice("missing-id", "A", "10:00", "11:00", ctx([], [makePlan()]));
    expect(result).toEqual({ ok: false, reason: "找不到租借人的人員資料" });
  });

  it("returns an error when the roster's pricing plan id has no matching plan", () => {
    const roster = [makeRoster({ id: "r1", pricingPlanId: "MISSING" })];
    const result = calculateRentalPrice("r1", "A", "10:00", "11:00", ctx(roster, [makePlan({ id: "GENERAL" })]));
    expect(result).toEqual({ ok: false, reason: "找不到價格方案「MISSING」" });
  });
});

describe("calculateCustomerPrice (D5: customer bookings have no roster row)", () => {
  it("prices against the single plan with role='customer'", () => {
    const plans = [
      makePlan({ id: "TEACHER", category: "teacher", roomARate: 500, roomBRate: 250 }),
      makePlan({ id: "CUSTOMER", category: "customer", roomARate: 1250, roomBRate: 800 }),
    ];
    const result = calculateCustomerPrice("A", "10:00", "12:00", ctx([], plans));
    expect(result).toEqual({ ok: true, hours: 2, amount: 2500 });
  });

  it("returns an error when no customer plan exists", () => {
    const plans = [makePlan({ id: "TEACHER", category: "teacher" })];
    const result = calculateCustomerPrice("A", "10:00", "11:00", ctx([], plans));
    expect(result).toEqual({ ok: false, reason: "找不到客戶價格方案" });
  });
});
