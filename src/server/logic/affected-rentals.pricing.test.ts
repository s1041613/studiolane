import { describe, expect, it } from "vitest";
import { unpaidRentalsForPlan } from "@/server/logic/affected-rentals";
import { SAMPLE_PURPOSE_SETTINGS, makeRental } from "@/server/logic/test-fixtures";
import type { PurposeSetting } from "@/server/logic/purpose-rules";
import { PaymentMethod, PaymentState, RentalStatus } from "@/server/types/home";
import { ARCHIVED_AT, GENERAL, STAFF_PLAN, TEACHER_PLAN, person } from "@/server/logic/__fixtures__/pricing-plans";

// 價格方案 P10–P13 / T12–T14, 今天 10/13.
const NOW = new Date("2026-10-13T12:00:00+08:00");
const PURPOSES = SAMPLE_PURPOSE_SETTINGS;

const ROSTER = [
  person("示範小雨", "teacher"),
  person("示範小橘", "teacher"),
  person("示範小月", "teacher"),
  person("示範小鹿", "teacher", { archivedAt: ARCHIVED_AT }),
  person("demo_kiki", "staff", { role: "staff" }),
  person("示範薄荷", "general", { role: "guest_teacher" }),
];

function rosterRental(id: string, renterId: string, date: string, overrides: Parameters<typeof makeRental>[0] | object = {}) {
  return makeRental({ id, date, renterId, renterType: "roster", person: renterId, ...overrides });
}

describe("unpaidRentalsForPlan", () => {
  it("P10 / T12: unpaid 待確認／待付款／已登記 bookings of the plan's people, soonest first", () => {
    const rentals = [
      rosterRental("demo_moon", "示範小月", "2026-10-20", { room: "B", amount: 600, status: RentalStatus.Registered }),
      rosterRental("demo_xiaoyu", "示範小雨", "2026-10-15", { amount: 1000, status: RentalStatus.Pending }),
      rosterRental("demo_orange", "示範小橘", "2026-10-18", { amount: 500, status: RentalStatus.AwaitingPayment }),
      rosterRental("demo_kiki", "demo_kiki", "2026-10-16", { amount: 0 }),
    ];
    expect(unpaidRentalsForPlan(TEACHER_PLAN, rentals, ROSTER, PURPOSES, NOW).map((r) => r.id)).toEqual(["demo_xiaoyu", "demo_orange", "demo_moon"]);
  });

  it("T12: leaves out paid, not-required, cancelled, postponed, completed and already-started ones", () => {
    const rentals = [
      rosterRental("paid", "示範小雨", "2026-10-16", { paymentState: PaymentState.Paid }),
      rosterRental("free", "示範小雨", "2026-10-16", { paymentState: PaymentState.NotRequired, paymentMethod: null }),
      rosterRental("cancelled", "示範小雨", "2026-10-16", { status: RentalStatus.Cancelled }),
      rosterRental("postponed", "示範小雨", "2026-10-16", { status: RentalStatus.Postponed }),
      rosterRental("completed", "示範小雨", "2026-10-16", { status: RentalStatus.Completed }),
      rosterRental("past", "示範小雨", "2026-10-10"),
      rosterRental("kept", "示範小雨", "2026-10-16", { paymentMethod: PaymentMethod.Transfer }),
    ];
    expect(unpaidRentalsForPlan(TEACHER_PLAN, rentals, ROSTER, PURPOSES, NOW).map((r) => r.id)).toEqual(["kept"]);
  });

  it("T12: an archived person's unpaid booking still counts — its amount was priced from this plan", () => {
    const rentals = [rosterRental("deer", "示範小鹿", "2026-10-17")];
    expect(unpaidRentalsForPlan(TEACHER_PLAN, rentals, ROSTER, PURPOSES, NOW).map((r) => r.id)).toEqual(["deer"]);
  });

  it("P12 / T13: the customer plan covers customer bookings and guest teachers on it", () => {
    const rentals = [
      makeRental({ id: "anne", date: "2026-10-22", person: "demo Anne", renterType: "customer", renterId: null }),
      rosterRental("demo_mint", "示範薄荷", "2026-10-25", { status: RentalStatus.AwaitingPayment }),
      rosterRental("demo_xiaoyu", "示範小雨", "2026-10-15"),
    ];
    expect(unpaidRentalsForPlan(GENERAL, rentals, ROSTER, PURPOSES, NOW).map((r) => r.id)).toEqual(["anne", "demo_mint"]);
    expect(unpaidRentalsForPlan(TEACHER_PLAN, rentals, ROSTER, PURPOSES, NOW).map((r) => r.id)).toEqual(["demo_xiaoyu"]);
  });

  it("T13: customer bookings never land on a non-customer plan", () => {
    const rentals = [makeRental({ id: "anne", date: "2026-10-22", renterType: "customer", renterId: null })];
    expect(unpaidRentalsForPlan(STAFF_PLAN, rentals, ROSTER, PURPOSES, NOW)).toEqual([]);
  });

  it("P13 / T14: lists every one of 14, soonest first — no 「還有 N 筆」 cut-off", () => {
    const rentals = Array.from({ length: 14 }, (_, i) =>
      rosterRental(`r${i}`, "示範小雨", `2026-10-${String(30 - i).padStart(2, "0")}`),
    );
    const listed = unpaidRentalsForPlan(TEACHER_PLAN, rentals, ROSTER, PURPOSES, NOW);
    expect(listed).toHaveLength(14);
    expect(listed[0].date).toBe("2026-10-17");
    expect(listed[13].date).toBe("2026-10-30");
  });

  // 價格方案 I-04 / R19: a booking priced by its own role's 指定價格 or 折扣
  // doesn't owe the plan's rate, so a rate change can't affect it.
  // private_lesson's teacher pricing (指定 0/0) comes from
  // SAMPLE_PURPOSE_SETTINGS unchanged.
  it("I-04 / T20: leaves out unpaid bookings whose role has its own pricing for the purpose", () => {
    const rentals = [
      rosterRental("lesson", "示範小雨", "2026-10-15", { purpose: "private_lesson", amount: 0 }),
      rosterRental("dance", "示範小雨", "2026-10-16", { purpose: "dance", amount: 500 }),
    ];
    expect(unpaidRentalsForPlan(TEACHER_PLAN, rentals, ROSTER, PURPOSES, NOW).map((r) => r.id)).toEqual(["dance"]);
  });

  // R19: a 折扣 teacher pricing on yoga doesn't owe the teacher plan's rate —
  // only aerobics (方案價格 / missing = 方案價格) still lists its teacher booking.
  it("R19 / T20: discount pricing is also left out, plan pricing (missing) still listed", () => {
    const purposes: PurposeSetting[] = PURPOSES.map((setting) =>
      setting.purpose === "yoga" ? { ...setting, rolePricing: { teacher: { mode: "discount", payPercent: 80 } } } : setting,
    );
    const rentals = [
      rosterRental("yoga", "示範小雨", "2026-10-15", { purpose: "yoga", amount: 800 }),
      rosterRental("aerobics", "示範小雨", "2026-10-16", { purpose: "aerobics", amount: 1000 }),
    ];
    expect(unpaidRentalsForPlan(TEACHER_PLAN, rentals, ROSTER, purposes, NOW).map((r) => r.id)).toEqual(["aerobics"]);
  });

  // T21 / R15: other roles booking the same purpose still owe their own
  // plan's rate — a teacher's own pricing doesn't hide a customer booking.
  it("T21 / R15: a role's own pricing doesn't exclude other roles on the same purpose", () => {
    const purposes: PurposeSetting[] = PURPOSES.map((setting) =>
      setting.purpose === "yoga"
        ? { ...setting, rolePricing: { teacher: { mode: "discount", payPercent: 80 } } }
        : setting,
    );
    const rentals = [
      rosterRental("teacherYoga", "示範小雨", "2026-10-15", { purpose: "yoga", amount: 800 }),
      makeRental({ id: "customerYoga", date: "2026-10-16", person: "示範小美", renterType: "customer", renterId: null, purpose: "yoga", amount: 2500 }),
    ];
    // Teacher plan: the teacher's own yoga booking is excluded (own discount pricing).
    expect(unpaidRentalsForPlan(TEACHER_PLAN, rentals, ROSTER, purposes, NOW).map((r) => r.id)).toEqual([]);
    // Customer plan: yoga has no customer pricing (missing = 方案價格), so it's still listed.
    expect(unpaidRentalsForPlan(GENERAL, rentals, ROSTER, purposes, NOW).map((r) => r.id)).toEqual(["customerYoga"]);
  });

  // The current setting decides: an archived purpose with its own role
  // pricing still counts as priced from that setting, not the plan.
  it("I-04: an archived purpose with its own role pricing still counts as its own pricing", () => {
    const purposes: PurposeSetting[] = PURPOSES.map((setting) =>
      setting.purpose === "workshop" ? { ...setting, archivedAt: ARCHIVED_AT } : setting,
    );
    const rentals = [rosterRental("workshop", "示範小雨", "2026-10-15", { purpose: "workshop", amount: 0 })];
    expect(unpaidRentalsForPlan(TEACHER_PLAN, rentals, ROSTER, purposes, NOW)).toEqual([]);
  });

  // R20 known limitation: once a role is closed, its pricing is ignored
  // (rolePricingFor → null), so the booking falls back to looking like
  // plan-priced and gets listed even though its amount came from the old
  // pricing, not the plan. Documented as current behaviour.
  it("R20: closing the role that used to have its own pricing makes its old bookings reappear in the reminder", () => {
    const purposes: PurposeSetting[] = PURPOSES.map((setting) =>
      setting.purpose === "yoga"
        ? { ...setting, allowedRoles: setting.allowedRoles.filter((r) => r !== "teacher"), rolePricing: { teacher: { mode: "discount", payPercent: 80 } } }
        : setting,
    );
    const rentals = [rosterRental("yoga", "示範小雨", "2026-10-15", { purpose: "yoga", amount: 800 })];
    expect(unpaidRentalsForPlan(TEACHER_PLAN, rentals, ROSTER, purposes, NOW).map((r) => r.id)).toEqual(["yoga"]);
  });
});
