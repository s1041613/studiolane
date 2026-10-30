import { checkBooking } from "@/server/logic/booking-rules";
import type { RuleContext } from "@/server/logic/booking-rules";
import { hourlyRate, quoteSlot } from "@/server/logic/pricing";
import type { PricingContext, QuoteContext } from "@/server/logic/pricing";
import { purposeAvailability } from "@/server/logic/purpose-rules";
import type { BookingDraft, Purpose, RenterSelection, SlotDraft } from "@/server/logic/booking";
import { PaymentMethod, PaymentState, RentalStatus } from "@/server/types/home";
import type { RentalSummary } from "@/server/types/home";
import { intervalsOverlap, toStartsEndsAt } from "@/server/supabase/codecs";
import type { DateTimeInterval, RoleCode } from "@/server/supabase/codecs";

export type BookingValidationContext = RuleContext &
  QuoteContext & {
    // S-9: slots starting before this are rejected. Defaults to the current time.
    now?: Date;
  };

const STILL_HELD = new Set<RentalStatus>([RentalStatus.Pending, RentalStatus.AwaitingPayment, RentalStatus.Registered]);

// S-8: the same renter already holds (or is waiting on) an overlapping slot in
// this room — almost always a duplicate submission. Roster renters are matched
// by id; customers only have a typed name to go on.
function isOwnOverlap(
  rental: RentalSummary,
  renter: RenterSelection,
  room: "A" | "B",
  interval: DateTimeInterval,
): boolean {
  const sameRenter =
    renter.type === "roster"
      ? rental.renterType === "roster" && rental.renterId === renter.id
      : rental.renterType === "customer" && rental.person === renter.name;
  return (
    sameRenter &&
    rental.room === room &&
    STILL_HELD.has(rental.status) &&
    intervalsOverlap(interval, { startsAt: new Date(rental.startsAt), endsAt: new Date(rental.endsAt) })
  );
}

// Keyed by the form field each message belongs under. Slot errors are keyed
// by the slot's index in draft.slots, flattened as `slots.0`, `slots.1`, ...
// instead of a nested object — E-19: a field-error map is always single-level.
export type BookingFieldErrors = {
  renter?: string;
  dates?: string;
  purpose?: string;
  payment?: string;
} & Partial<Record<`slots.${number}`, string>>;

export type PricedSlot = { slot: SlotDraft; hours: number; amount: number };

export type BookingValidationResult =
  | {
      ok: true;
      // The renter with its role re-read from the roster, never the client's.
      renter: RenterSelection;
      purpose: Purpose;
      paymentMethod: PaymentMethod | null;
      paymentState: PaymentState;
      slots: PricedSlot[];
    }
  | { ok: false; fieldErrors: BookingFieldErrors };

// S-4: a roster renter's role comes from the roster row looked up by id.
function resolveRenter(
  renter: RenterSelection,
  roster: PricingContext["roster"],
): { ok: true; renter: RenterSelection; role: RoleCode } | { ok: false; reason: string } {
  if (renter.type === "customer") return { ok: true, renter, role: "customer" };
  const entry = roster.find((r) => r.id === renter.id);
  if (!entry) return { ok: false, reason: "找不到租借人的人員資料" };
  // Roster R21: archived while the form was open.
  if (entry.archivedAt !== null) return { ok: false, reason: "這位人員已停用" };
  return { ok: true, renter: { ...renter, role: entry.role }, role: entry.role };
}

// S-1..S-7, run by the form before submitting and again by the server
// against fresh data. Every problem is collected rather than stopping at the
// first, so the form can outline all of them at once (S-錯誤-4).
export function validateBookingDraft(
  draft: BookingDraft,
  ctx: BookingValidationContext,
): BookingValidationResult {
  const errors: BookingFieldErrors = {};

  // S-1 / S-4: renter
  let renter: RenterSelection | null = null;
  let role: RoleCode | null = null;
  if (!draft.renter) {
    errors.renter = "請選擇租借人";
  } else {
    const resolved = resolveRenter(draft.renter, ctx.roster);
    if (resolved.ok) {
      renter = resolved.renter;
      role = resolved.role;
    } else {
      errors.renter = resolved.reason;
    }
  }

  // S-1: dates
  if (draft.slots.length === 0) errors.dates = "請至少選一天";

  // S-1 / S-3 / S-4 / 用途 B4: purpose, judged against purpose_settings.
  // Archived is checked even before the renter is known.
  const { purpose } = draft;
  if (!purpose) {
    errors.purpose = "請選擇用途";
  } else {
    const availability = purposeAvailability(purpose, role, ctx.purposeSettings);
    if (!availability.ok) errors.purpose = availability.reason;
  }
  const usablePurpose = purpose && !errors.purpose ? purpose : null;
  // A booking's renter, purpose and room are shared by every slot, so one
  // hourly rate decides whether it needs paying at all: 0 → not_required.
  const rate =
    usablePurpose && renter ? hourlyRate({ renter, purpose: usablePurpose, room: draft.room }, ctx) : null;
  const isFree = rate?.ok === true && rate.rate === 0;

  // S-1 / F-付款-3: payment, only once we know the booking is chargeable
  if (usablePurpose && role && !isFree && !draft.payment) {
    errors.payment = "請選擇付款方式";
  }

  // S-1 / S-2 / S-5 / S-6 / S-7: each slot card
  const priced: PricedSlot[] = [];
  const now = ctx.now ?? new Date();
  draft.slots.forEach((slot, index) => {
    // Format and start/end consistency first (S-2), so the checks below can
    // rely on a well-formed interval.
    const shapeCheck = checkBooking(slot, draft.room, { rules: [], existingRentals: [] });
    if (!shapeCheck.ok) {
      errors[`slots.${index}`] = shapeCheck.reason;
      return;
    }
    const interval = toStartsEndsAt(slot.date, slot.start, slot.end, slot.isCrossMidnight);
    if (interval.startsAt < now) {
      errors[`slots.${index}`] = "這個時段已經過去了"; // S-9
      return;
    }
    if (draft.renter && ctx.existingRentals.some((r) => isOwnOverlap(r, draft.renter!, draft.room, interval))) {
      errors[`slots.${index}`] = "你已經預約過這個時段"; // S-8
      return;
    }
    const slotCheck = checkBooking(slot, draft.room, ctx);
    if (!slotCheck.ok) {
      errors[`slots.${index}`] = slotCheck.reason;
      return;
    }
    if (!renter || !usablePurpose) return;
    const quote = quoteSlot({ renter, purpose: usablePurpose, room: draft.room, slot }, ctx);
    if (!quote.ok) {
      errors[`slots.${index}`] = quote.reason;
      return;
    }
    priced.push({ slot, hours: quote.hours, amount: quote.amount });
  });

  const hasErrors = Object.keys(errors).length > 0;
  if (hasErrors || !renter || !usablePurpose) {
    return { ok: false, fieldErrors: errors };
  }

  // S-寫入-1 / S-寫入-2
  return {
    ok: true,
    renter,
    purpose: usablePurpose,
    paymentMethod: isFree ? null : draft.payment === "on_site" ? PaymentMethod.OnSite : PaymentMethod.Transfer,
    paymentState: isFree ? PaymentState.NotRequired : PaymentState.Unpaid,
    slots: priced,
  };
}

export type ErrorField = "renter" | "dates" | `slot-${number}` | "purpose" | "payment";

// S-錯誤-3: problem fields in on-screen order, so the form can scroll to the
// first one.
export function orderedErrorFields(errors: BookingFieldErrors): ErrorField[] {
  const slotFields = Object.keys(errors)
    .filter((key) => /^slots\.\d+$/.test(key))
    .map((key) => Number(key.slice("slots.".length)))
    .sort((a, b) => a - b)
    .map((i): ErrorField => `slot-${i}`);
  return [
    ...(errors.renter ? (["renter"] as const) : []),
    ...(errors.dates ? (["dates"] as const) : []),
    ...slotFields,
    ...(errors.purpose ? (["purpose"] as const) : []),
    ...(errors.payment ? (["payment"] as const) : []),
  ];
}
