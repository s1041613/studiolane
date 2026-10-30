import type { RoleCode } from "@/server/supabase/codecs";
import type { HHmm, Purpose, RenterSelection, SlotDraft } from "@/server/logic/booking";
import type { PurposeSetting } from "@/server/logic/purpose-rules";
import { rolePricingFor } from "@/server/logic/purpose-pricing";

// D6: identity goes through the roster UUID now, not the name — names are
// not unique in the DB (roster.name has no unique constraint) and D5's
// customer flow has no roster row at all, so a name-keyed join would also
// be the wrong join target once customers exist. role/category still carry
// the DB's "身分類型" meaning (R2 in the migration plan: pricing_plans.role).
export type RosterEntry = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: RoleCode;
  pricingPlanId: string;
  // Bare handle without "@" (roster_instagram_handle); "" when unknown.
  instagram: string;
  // Soft delete: set = 已停用. Pickers skip archived people; history
  // keeps showing them.
  archivedAt: string | null;
};

export type PricingPlan = {
  id: string;
  // DB `role` column (teacher/staff/customer); named `category` here to
  // match the existing "身分類型" domain vocabulary (see R2 in the plan).
  category: RoleCode;
  appliesTo: string;
  roomARate: number;
  roomBRate: number;
  // Soft delete. Archived plans still price existing bookings (T20).
  archivedAt: string | null;
};

export type PricingContext = {
  roster: RosterEntry[];
  plans: PricingPlan[];
};

// What quoting a booking reads: plans for most purposes, purpose_settings for
// the ones with a special price.
export type QuoteContext = PricingContext & {
  purposeSettings: PurposeSetting[];
};

export type PriceResult = { ok: true; hours: number; amount: number } | { ok: false; reason: string };

function toMinutes(hhmm: HHmm): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function slotHours(start: HHmm, end: HHmm): number {
  const startMin = toMinutes(start);
  const endMin = toMinutes(end);
  const durationMin = endMin > startMin ? endMin - startMin : 1440 - startMin + endMin;
  return durationMin / 60;
}

export type RateInput = {
  renter: RenterSelection;
  purpose: Purpose;
  room: "A" | "B";
};

export type SlotQuoteInput = RateInput & { slot: SlotDraft };

export type RateResult = { ok: true; rate: number } | { ok: false; reason: string };

function roomRate(room: "A" | "B", rates: { roomARate: number; roomBRate: number }): number {
  return room === "A" ? rates.roomARate : rates.roomBRate;
}

type PlanLookup = { ok: true; plan: PricingPlan } | { ok: false; reason: string };

// Join: renterId -> RosterEntry.pricingPlanId -> PricingPlan.
function renterPlan(renterId: string, ctx: PricingContext): PlanLookup {
  const roster = ctx.roster.find((r) => r.id === renterId);
  if (!roster) return { ok: false, reason: `找不到租借人的人員資料` };
  const plan = ctx.plans.find((p) => p.id === roster.pricingPlanId);
  if (!plan) return { ok: false, reason: `找不到價格方案「${roster.pricingPlanId}」` };
  return { ok: true, plan };
}

// D5: customer bookings have no roster row — they're priced against the
// single pricing_plans row with role='customer' (enforced by the DB's
// pricing_plans_one_customer partial unique index).
function customerPlan(ctx: PricingContext): PlanLookup {
  const plan = ctx.plans.find((p) => p.category === "customer");
  return plan ? { ok: true, plan } : { ok: false, reason: "找不到客戶價格方案" };
}

// 用途 B4 / T14–T16: 指定價格 (price) wins outright — no plan lookup at all.
// 折扣 (discount) still looks up the renter's own plan (customers the single
// customer plan) and pays payPercent% of that rate, multiplying before
// dividing (R13: the per-hour rate itself isn't rounded). A missing pricing
// row (null) means 方案價格 — the plan rate as-is. A rate of 0 means the
// booking needs no payment. The caller is responsible for `renter.role`
// being trustworthy — the server re-derives it from the roster (S-4) — and
// for the purpose being open to that role (purposeAvailability).
export function hourlyRate({ renter, purpose, room }: RateInput, ctx: QuoteContext): RateResult {
  const role: RoleCode = renter.type === "customer" ? "customer" : renter.role;
  const pricing = rolePricingFor(purpose, role, ctx.purposeSettings);
  if (pricing?.mode === "price") return { ok: true, rate: room === "A" ? pricing.roomA : pricing.roomB };
  const lookup = renter.type === "customer" ? customerPlan(ctx) : renterPlan(renter.id, ctx);
  if (!lookup.ok) return lookup;
  const planRate = roomRate(room, lookup.plan);
  if (pricing?.mode === "discount") return { ok: true, rate: (planRate * pricing.payPercent) / 100 };
  return { ok: true, rate: planRate };
}

// One slot's price, M-1..M-5: hours × hourlyRate.
export function quoteSlot({ slot, ...rateInput }: SlotQuoteInput, ctx: QuoteContext): PriceResult {
  const rate = hourlyRate(rateInput, ctx);
  if (!rate.ok) return rate;
  const hours = slotHours(slot.start, slot.end);
  return { ok: true, hours, amount: Math.round(hours * rate.rate) };
}

// Plan-only pricing (no purpose involved). Cross-midnight duration (end <
// start) rolls the end forward by a day.
export function calculateRentalPrice(
  renterId: string,
  room: "A" | "B",
  start: HHmm,
  end: HHmm,
  ctx: PricingContext,
): PriceResult {
  return priceFromPlan(renterPlan(renterId, ctx), room, start, end);
}

export function calculateCustomerPrice(
  room: "A" | "B",
  start: HHmm,
  end: HHmm,
  ctx: PricingContext,
): PriceResult {
  return priceFromPlan(customerPlan(ctx), room, start, end);
}

function priceFromPlan(lookup: PlanLookup, room: "A" | "B", start: HHmm, end: HHmm): PriceResult {
  if (!lookup.ok) return lookup;
  const hours = slotHours(start, end);
  return { ok: true, hours, amount: Math.round(hours * roomRate(room, lookup.plan)) };
}
