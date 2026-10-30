import { PaymentState, RentalStatus } from "@/server/types/home";
import type { PricingPlan, RosterEntry } from "@/server/logic/pricing";
import type { Purpose } from "@/server/logic/booking";
import type { PurposeSetting } from "@/server/logic/purpose-rules";
import { rolePricingFor } from "@/server/logic/purpose-pricing";
import type { RentalSummary } from "@/server/types/home";

// Data behind the C2 affected-rentals list. Each settings page adds its own
// selection on top of upcomingRentals — e.g. 價格方案 the unpaid ones on a
// plan, 租借時段 the registered ones overlapping a new blocked slot.

// 待確認／待付款／已登記: the bookings that still hold a slot or still owe
// money. Completed, postponed and cancelled ones are history.
const STILL_ACTIVE = new Set<RentalStatus>([RentalStatus.Pending, RentalStatus.AwaitingPayment, RentalStatus.Registered]);

// Active bookings that haven't started yet, soonest first.
export function upcomingRentals(rentals: readonly RentalSummary[], now: Date): RentalSummary[] {
  return rentals
    .filter((r) => STILL_ACTIVE.has(r.status) && new Date(r.startsAt) > now)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

// 價格方案 I-04 / R19: bookings priced from `plan` that still owe money, so a
// rate change leaves them at the old amount. A plan's renters are everyone on
// it (archived people too — their booking was priced from it), plus every
// customer booking for the customer plan. A booking is left out only when
// its own role (plan.category) has 指定價格 or 折扣 pricing for its purpose —
// those amounts never came from (or never purely came from) the plan rate.
// Other roles booking the same purpose still owe the plan's rate (R15), so
// they stay listed. Bookings don't record how they were priced, so the
// purpose's current setting decides, archived purposes included (R20: known
// limitation when a role was later closed — not handled here).
export function unpaidRentalsForPlan(
  plan: PricingPlan,
  rentals: readonly RentalSummary[],
  roster: readonly RosterEntry[],
  purposeSettings: readonly PurposeSetting[],
  now: Date,
): RentalSummary[] {
  const renterIds = new Set(roster.filter((person) => person.pricingPlanId === plan.id).map((person) => person.id));
  const hasOwnPricing = (purpose: string) =>
    rolePricingFor(purpose as Purpose, plan.category, purposeSettings) !== null;
  const pricedByPlan = (r: RentalSummary) =>
    !hasOwnPricing(r.purpose) &&
    (r.renterType === "customer" ? plan.category === "customer" : r.renterId !== null && renterIds.has(r.renterId));
  return upcomingRentals(rentals, now).filter((r) => r.paymentState === PaymentState.Unpaid && pricedByPlan(r));
}
