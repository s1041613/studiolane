"use server";

import { randomUUID } from "node:crypto";
import { failBlockers, failFields, ok } from "@/lib/result";
import type { Sealed } from "@/lib/result";
import { runAction } from "@/server/boundary/run-action";
import { validateBookingDraft } from "@/server/logic/booking-validation";
import type { BookingFieldErrors } from "@/server/logic/booking-validation";
import type { BookingConflict } from "@/server/logic/booking-conflicts";
import type { BookingDraft } from "@/server/logic/booking";
import { RentalRepository } from "@/server/repositories/rental-repository";
import type { NewRentalRow } from "@/server/repositories/rental-repository";
import { loadBookingSources } from "@/server/services/booking-sources";

const rentalRepo = new RentalRepository();

// Someone else's held, overlapping booking(s); shown to the person, who
// resends with their ids in acknowledgedIds.
export type SubmitBookingBlockers = { conflicts: BookingConflict[] };

// Not audited yet; runAction is the same boundary without the audit row.
export type SubmitBookingResult = Sealed<
  { batchId: string; rentalIds: string[] },
  { fields: BookingFieldErrors; blockers: SubmitBookingBlockers }
>;

const NEEDS_CONFIRM_MESSAGE = "這個時段跟別人的預約撞到了，請確認是否仍要送出";
// Same field error validateBookingDraft's own-overlap check gives (S-8);
// create_booking_batch repeats the check inside its lock since the form's
// read of existingRentals predates that lock.
const OWN_OVERLAP_MESSAGE = "你已經預約過這個時段";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Re-runs the form's checks against freshly-read rules, roster, plans and
// rentals — someone may have registered a conflicting slot while the form
// was open, and the client's data is never trusted. All-or-nothing: any
// problem means none of the batch is written. The batch_id shared by every
// slot is generated here.
//
// acknowledgedIds carries the conflict ids the person has already been
// shown and told to submit anyway. create_booking_batch is the source of
// truth for whether that's still enough — it recomputes conflicts itself,
// inside the room's own advisory lock — and this action only maps its
// answer onto the three outcomes the screen reacts to.
export async function submitBooking(draft: BookingDraft, acknowledgedIds: string[] = []): Promise<SubmitBookingResult> {
  return runAction({ attempted: "送出預約", access: "staff", revalidate: ["/bookings", "/"] }, async (actor) => {
    const result = validateBookingDraft(draft, await loadBookingSources());
    if (!result.ok) return failFields(result.fieldErrors);

    const { renter, purpose, paymentMethod, paymentState } = result;
    const batchId = randomUUID();
    const createdAt = new Date().toISOString();
    const rows: NewRentalRow[] = result.slots.map(({ slot, amount }) => ({
      id: randomUUID(),
      batchId,
      createdAt,
      date: slot.date,
      start: slot.start,
      end: slot.end,
      isCrossMidnight: slot.isCrossMidnight,
      room: draft.room,
      renterId: renter.type === "roster" ? renter.id : null,
      renterType: renter.type,
      renterName: renter.name,
      purpose,
      note: draft.note ?? "",
      paymentMethod,
      paymentState,
      amount,
      handler: actor.name,
    }));

    const batch = await rentalRepo.createBatch(
      rows,
      acknowledgedIds.filter((id) => UUID_PATTERN.test(id)),
    );
    if (batch.status === "needs_confirm") {
      return failBlockers("FAILED_PRECONDITION", NEEDS_CONFIRM_MESSAGE, { conflicts: batch.conflicts });
    }
    if (batch.status === "own_overlap") {
      const fieldErrors: BookingFieldErrors = {};
      rows.forEach((row, index) => {
        if (batch.ids.includes(row.id)) fieldErrors[`slots.${index}`] = OWN_OVERLAP_MESSAGE;
      });
      return failFields(fieldErrors);
    }

    return ok({ batchId, rentalIds: rows.map((r) => r.id) });
  });
}
