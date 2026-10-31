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
    // Slots starting before this are rejected; defaults to the current time.
    now?: Date;
  };

const STILL_HELD = new Set<RentalStatus>([RentalStatus.Pending, RentalStatus.AwaitingPayment, RentalStatus.Registered]);

// True when the same renter already holds (or awaits) an overlapping slot —
// almost always a duplicate submission. Roster renters match by id;
// customers only have a typed name.
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

// Keyed by field; slot errors use the slot's index flattened as `slots.0`,
// `slots.1`, ... rather than a nested object.
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
      // Role is re-read from the roster, never trusted from the client.
      renter: RenterSelection;
      purpose: Purpose;
      paymentMethod: PaymentMethod | null;
      paymentState: PaymentState;
      slots: PricedSlot[];
    }
  | { ok: false; fieldErrors: BookingFieldErrors };

function resolveRenter(
  renter: RenterSelection,
  roster: PricingContext["roster"],
): { ok: true; renter: RenterSelection; role: RoleCode } | { ok: false; reason: string } {
  if (renter.type === "customer") return { ok: true, renter, role: "customer" };
  const entry = roster.find((r) => r.id === renter.id);
  if (!entry) return { ok: false, reason: "找不到租借人的人員資料" };
  // Catches a roster entry archived after the form was opened.
  if (entry.archivedAt !== null) return { ok: false, reason: "這位人員已停用" };
  // id, name and role all come from the roster row, never the client's —
  // a roster renter's name is only ever a display label the client sends,
  // not an identity the server should trust.
  return { ok: true, renter: { type: "roster", id: entry.id, name: entry.name, role: entry.role }, role: entry.role };
}

// Run by the form before submitting and again by the server against fresh
// data. Every problem is collected rather than stopping at the first, so
// the form can outline them all at once.
export function validateBookingDraft(
  draft: BookingDraft,
  ctx: BookingValidationContext,
): BookingValidationResult {
  const errors: BookingFieldErrors = {};

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

  if (draft.slots.length === 0) errors.dates = "請至少選一天";

  // Purpose is judged against purpose_settings; archived is checked even
  // before the renter is known.
  const { purpose } = draft;
  if (!purpose) {
    errors.purpose = "請選擇用途";
  } else {
    const availability = purposeAvailability(purpose, role, ctx.purposeSettings);
    if (!availability.ok) errors.purpose = availability.reason;
  }
  const usablePurpose = purpose && !errors.purpose ? purpose : null;
  // Renter, purpose and room are shared by every slot, so one hourly rate
  // decides whether the whole booking needs paying: 0 → not_required.
  const rate =
    usablePurpose && renter ? hourlyRate({ renter, purpose: usablePurpose, room: draft.room }, ctx) : null;
  const isFree = rate?.ok === true && rate.rate === 0;

  if (usablePurpose && role && !isFree && !draft.payment) {
    errors.payment = "請選擇付款方式";
  }

  const priced: PricedSlot[] = [];
  const now = ctx.now ?? new Date();
  // Earlier slots' intervals in this same draft, in order, so a later slot
  // that collides with one of them (an exact date+time repeat is just the
  // degenerate case of an overlap) gets the error, never the earlier one.
  const seenIntervals: DateTimeInterval[] = [];
  draft.slots.forEach((slot, index) => {
    // Shape and start/end consistency checked first, so later checks can
    // rely on a well-formed interval.
    const shapeCheck = checkBooking(slot, draft.room, { rules: [], existingRentals: [] });
    if (!shapeCheck.ok) {
      errors[`slots.${index}`] = shapeCheck.reason;
      return;
    }
    const interval = toStartsEndsAt(slot.date, slot.start, slot.end, slot.isCrossMidnight);
    if (interval.startsAt < now) {
      errors[`slots.${index}`] = "這個時段已經過去了";
      return;
    }
    if (seenIntervals.some((seen) => intervalsOverlap(interval, seen))) {
      errors[`slots.${index}`] = "這個時段跟上面選的時段重複了";
      return;
    }
    seenIntervals.push(interval);
    const draftRenter = draft.renter;
    if (draftRenter && ctx.existingRentals.some((r) => isOwnOverlap(r, draftRenter, draft.room, interval))) {
      errors[`slots.${index}`] = "你已經預約過這個時段";
      return;
    }
    // A different renter's registered rental is a hard block (checkBooking
    // only counts RentalStatus.Registered rows); their still-pending or
    // awaiting-payment holds are conflicts left for create_booking_batch to
    // confirm instead, so they don't reach this check.
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

// Problem fields in on-screen order, so the form can scroll to the first one.
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
