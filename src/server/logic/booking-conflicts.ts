// E-41: whether a submitted slot collides with another renter's held
// booking in the same room. "Held" and the overlap test are the same ones
// booking-validation.ts uses for S-8 (own-overlap, a field error); the
// difference here is the renter, not the room or the status set, so this
// reuses STILL_HELD and intervalsOverlap rather than redefining them.
//
// The same renter's own overlap never reaches this function: it is caught
// earlier, as a field error, by validateBookingDraft (S-8 / 情境7). This
// module only answers "does this slot collide with someone else's booking",
// which needs a person's confirmation rather than blocking the form.
import { STILL_HELD } from "@/server/logic/booking-validation";
import type { RenterSelection, SlotDraft } from "@/server/logic/booking";
import { RentalStatus } from "@/server/types/home";
import type { RentalSummary } from "@/server/types/home";
import { intervalsOverlap, toStartsEndsAt } from "@/server/supabase/codecs";

// One other renter's held booking that overlaps a slot being submitted.
// Shown in the confirmation dialog: date, time, renter name and status
// (情境2).
export type BookingConflict = {
  id: string;
  date: string;
  start: string;
  end: string;
  renterName: string;
  status: RentalStatus;
};

// The mirror image of booking-validation's isOwnOverlap: true when `rental`
// belongs to someone other than `renter`. Roster renters are matched by id;
// customers only have a typed name to go on (same as S-8).
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

// 情境9: every slot in the batch is checked, since the batch writes
// all-or-nothing. Conflicts are deduplicated by rental id, since the same
// held booking can overlap more than one submitted slot.
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

// 情境3/情境5: whether every conflict currently seen was already shown to,
// and acknowledged by, the person. A conflict id missing from
// acknowledgedIds means either they never saw it, or it appeared after
// their confirmation dialog opened — both cases must confirm again.
export function isFullyAcknowledged(conflicts: readonly BookingConflict[], acknowledgedIds: readonly string[]): boolean {
  const acknowledged = new Set(acknowledgedIds);
  return conflicts.every((conflict) => acknowledged.has(conflict.id));
}
