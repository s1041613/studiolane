import { STILL_HELD } from "@/server/logic/booking-validation";
import type { RenterSelection, SlotDraft } from "@/server/logic/booking";
import { RentalStatus } from "@/server/types/home";
import type { RentalSummary } from "@/server/types/home";
import { intervalsOverlap, toStartsEndsAt } from "@/server/supabase/codecs";

// One other renter's held booking that overlaps a submitted slot. Shown in
// the confirmation dialog: date, time, renter name, status.
export type BookingConflict = {
  id: string;
  date: string;
  start: string;
  end: string;
  renterName: string;
  status: RentalStatus;
};

// Mirrors booking-validation's isOwnOverlap: true when `rental` belongs to
// someone other than `renter`. Roster renters match by id; customers only
// have a typed name.
function isDifferentRenter(rental: RentalSummary, renter: RenterSelection): boolean {
  return renter.type === "roster"
    ? !(rental.renterType === "roster" && rental.renterId === renter.id)
    : !(rental.renterType === "customer" && rental.person === renter.name);
}

function conflictingRentals(
  slot: SlotDraft,
  room: "A" | "B",
  renter: RenterSelection,
  existingRentals: readonly RentalSummary[],
): RentalSummary[] {
  const interval = toStartsEndsAt(slot.date, slot.start, slot.end, slot.isCrossMidnight);
  return existingRentals.filter(
    (rental) =>
      rental.room === room &&
      STILL_HELD.has(rental.status) &&
      isDifferentRenter(rental, renter) &&
      intervalsOverlap(interval, { startsAt: new Date(rental.startsAt), endsAt: new Date(rental.endsAt) }),
  );
}

function toConflict(rental: RentalSummary): BookingConflict {
  return { id: rental.id, date: rental.date, start: rental.start, end: rental.end, renterName: rental.person, status: rental.status };
}

// Whether a submitted slot collides with another renter's held booking in
// the same room. Reuses STILL_HELD and intervalsOverlap from
// booking-validation.ts rather than redefining "held" and the overlap test;
// the same renter's own overlap never reaches this function — it's caught
// earlier as a field error by validateBookingDraft.
//
// Every slot in the batch is checked, since the batch writes all-or-nothing;
// conflicts are deduplicated by rental id since the same held booking can
// overlap more than one slot.
export function findBookingConflicts(
  slots: readonly SlotDraft[],
  room: "A" | "B",
  renter: RenterSelection,
  existingRentals: readonly RentalSummary[],
): BookingConflict[] {
  const byId = new Map<string, BookingConflict>();
  for (const slot of slots) {
    for (const rental of conflictingRentals(slot, room, renter, existingRentals)) {
      if (!byId.has(rental.id)) byId.set(rental.id, toConflict(rental));
    }
  }
  return [...byId.values()];
}

// Whether every conflict currently seen was already shown to and
// acknowledged by the person. A missing id means either they never saw it,
// or it appeared after the dialog opened — both must confirm again.
export function isFullyAcknowledged(conflicts: readonly BookingConflict[], acknowledgedIds: readonly string[]): boolean {
  const acknowledged = new Set(acknowledgedIds);
  return conflicts.every((conflict) => acknowledged.has(conflict.id));
}
