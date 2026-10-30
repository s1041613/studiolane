// Shared test fixture builder for RentalSummary, used across
// booking.test.ts, booking-rules.test.ts, home-selectors.test.ts, and
// bookings.test.ts. Centralized so the five-plus call sites that used to
// each hand-roll a makeRental() can't drift out of sync with the
// RentalSummary shape (e.g. forgetting isCrossMidnight or a *Label field).
import { RentalStatus, PaymentMethod, PaymentState } from "@/server/types/home";
import type { RentalSummary } from "@/server/types/home";
import { toStartsEndsAt } from "@/server/supabase/codecs";
import type { RentalRule } from "@/server/logic/booking-rules";
import type { IsoDate } from "@/server/logic/booking";
import { isoWeekday } from "@/server/logic/date";
import type { PricingPlan, RosterEntry } from "@/server/logic/pricing";
import type { PurposeSetting } from "@/server/logic/purpose-rules";

// Each settings page edits only its own section below.

// === rental rules (上課時段 + 租借規則) ===
// kind defaults to "rental"; 上課時段 pass kind "class_hours".
type RuleSpec = Pick<RentalRule, "room" | "start" | "end" | "reason"> & Partial<Pick<RentalRule, "kind" | "effect" | "archivedAt">>;

// A weekly rule ticked for several weekdays becomes one row per weekday, the
// same way the settings form saves it (I-02). Ids are `${id}-${weekday}`.
export function weeklyRules(id: string, weekdays: readonly number[], spec: RuleSpec): RentalRule[] {
  return weekdays.map((weekday) => ({
    id: `${id}-${weekday}`,
    kind: "rental",
    weekday,
    onDate: null,
    effect: "block",
    archivedAt: null,
    ...spec,
  }));
}

// A one-day row; its weekday follows from the date.
export function oneDayRule(id: string, onDate: IsoDate, spec: RuleSpec): RentalRule {
  return { id, kind: "rental", weekday: isoWeekday(onDate), onDate, effect: "block", archivedAt: null, ...spec };
}

// Mirrors the 〈租借規則〉 sheet used across the BDD scenarios. 2026-10-05 is a
// Monday, so 2026-10-06 is the Tuesday the F-用途 examples refer to.
export const SAMPLE_RULES: RentalRule[] = [
  ...weeklyRules("R1", [1, 2, 3, 4], { kind: "class_hours", room: "A", start: "17:30", end: "22:30", reason: "上課時段" }),
  ...weeklyRules("R2", [5, 6, 7], { kind: "class_hours", room: "A", start: "13:30", end: "22:30", reason: "上課時段" }),
  ...weeklyRules("R3", [1, 2, 3, 4, 5], { room: "A", start: "06:00", end: "13:30", reason: "平日白天 13:30 前不開放" }),
  ...weeklyRules("R5", [1, 2, 3, 4, 5, 6, 7], { room: "B", start: "13:30", end: "14:00", reason: "準備時間" }),
  ...weeklyRules("R6", [1, 2, 3, 4, 5, 6, 7], { room: "B", start: "22:00", end: "22:30", reason: "清掃時間" }),
];

// docs/rental-time-rules/02-bdd 共用資料: room A's 上課時段 (ch-1 … ch-7) and the
// 平日白天 rental rule (am-1 … am-5), one row per weekday.
export const BASE_RULES: RentalRule[] = [
  ...weeklyRules("ch", [1, 2, 3, 4], { kind: "class_hours", room: "A", start: "17:30", end: "22:30", reason: "上課時段" }),
  ...weeklyRules("ch", [5, 6, 7], { kind: "class_hours", room: "A", start: "13:30", end: "22:30", reason: "上課時段" }),
  ...weeklyRules("am", [1, 2, 3, 4, 5], { room: "A", start: "06:00", end: "13:30", reason: "平日白天 13:30 前不開放" }),
];

// === roster (人員名單) ===
export const TEACHER: RosterEntry = {
  id: "teacher-1",
  name: "王老師",
  email: "",
  phone: "",
  role: "teacher",
  pricingPlanId: "plan-teacher",
  instagram: "",
  archivedAt: null,
};

export const STAFF: RosterEntry = {
  id: "staff-1",
  name: "demo Staff",
  email: "",
  phone: "",
  role: "staff",
  pricingPlanId: "plan-staff",
  instagram: "",
  archivedAt: null,
};

// === pricing plans (價格方案) ===
export const SAMPLE_PLANS: PricingPlan[] = [
  { id: "plan-teacher", category: "teacher", appliesTo: "", roomARate: 500, roomBRate: 250, archivedAt: null },
  // 0013: staff use the rooms for free (櫃檯價 0／0).
  { id: "plan-staff", category: "staff", appliesTo: "", roomARate: 0, roomBRate: 0, archivedAt: null },
  { id: "plan-customer", category: "customer", appliesTo: "", roomARate: 1250, roomBRate: 600, archivedAt: null },
];

// === purpose_settings (用途) ===
// The table seeded by 0014, after the E-5 migration: teachers book
// 展演／作品班／私課 free (paid elsewhere); everything else uses the plan.
export const SAMPLE_PURPOSE_SETTINGS: PurposeSetting[] = [
  { purpose: "dance", allowedRoles: ["teacher", "staff", "customer"], rolePricing: {}, archivedAt: null },
  { purpose: "aerobics", allowedRoles: ["teacher", "staff", "customer"], rolePricing: {}, archivedAt: null },
  { purpose: "yoga", allowedRoles: ["teacher", "staff", "customer"], rolePricing: {}, archivedAt: null },
  { purpose: "performance", allowedRoles: ["teacher"], rolePricing: { teacher: { mode: "price", roomA: 0, roomB: 0 } }, archivedAt: null },
  { purpose: "workshop", allowedRoles: ["teacher"], rolePricing: { teacher: { mode: "price", roomA: 0, roomB: 0 } }, archivedAt: null },
  { purpose: "private_lesson", allowedRoles: ["teacher"], rolePricing: { teacher: { mode: "price", roomA: 0, roomB: 0 } }, archivedAt: null },
  { purpose: "front_desk", allowedRoles: ["staff"], rolePricing: {}, archivedAt: null },
  { purpose: "photography", allowedRoles: ["staff"], rolePricing: {}, archivedAt: null },
];

// === rentals (預約) ===

export function makeRental(
  overrides: Partial<RentalSummary> & {
    date: string;
    start?: string;
    end?: string;
    isCrossMidnight?: boolean;
  },
): RentalSummary {
  const { date, start = "08:00", end = "09:00", isCrossMidnight = false, ...rest } = overrides;
  const { startsAt, endsAt } = toStartsEndsAt(date, start, end, isCrossMidnight);
  return {
    id: "r1",
    batchId: null,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    date,
    weekday: "二",
    start,
    end,
    isCrossMidnight,
    room: "A",
    handler: "",
    person: "測試",
    renterId: null,
    renterType: "customer",
    purpose: "dance",
    purposeLabel: "舞蹈",
    paymentState: PaymentState.Unpaid,
    status: RentalStatus.Pending,
    note: "",
    paymentMethod: PaymentMethod.OnSite,
    paymentMethodLabel: "現場繳費",
    amount: null,
    createdAt: "2026-01-01T00:00:00Z",
    ...rest,
  };
}
