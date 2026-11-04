"use server";

import { fail, failBlockers, ok } from "@/lib/result";
import type { Outcome, Sealed } from "@/lib/result";
import { runAction } from "@/server/boundary/run-action";
import { withTransaction } from "@/server/drizzle/context";
import { RentalRepository } from "@/server/repositories/rental-repository";
import type { StatusPatch } from "@/server/repositories/rental-repository";
import { RulesRepository } from "@/server/repositories/rules-repository";
import { checkBooking } from "@/server/logic/booking-rules";
import {
  cancellationFor,
  checkActionAllowed,
  findRegisteredOverlaps,
  planConfirm,
} from "@/server/logic/bookings";
import type { BookingAction } from "@/server/logic/bookings";
import { PaymentState, RentalStatus } from "@/server/types/home";
import type { RentalSummary } from "@/server/types/home";

const rentalRepo = new RentalRepository();
const rulesRepo = new RulesRepository();

const NO_LONGER_RENTABLE = "這段時間已經不能租";
const STALE_BOOKING = "這筆預約的狀態已經變動，請重新整理後再試一次";
// These actions have no home-page surface to revalidate.
const REVALIDATE = ["/bookings"] as const;

// docs/rental-time-rules X5: a safety net before a booking starts holding
// its slot. Only covers bookings that haven't started yet — a started or
// past one must stay confirmable/payable regardless of today's rules.
async function stillRentable(rental: RentalSummary): Promise<boolean> {
  if (new Date(rental.startsAt) <= new Date()) return true;
  const slot = { date: rental.date, start: rental.start, end: rental.end, isCrossMidnight: rental.isCrossMidnight };
  return checkBooking(slot, rental.room, { rules: await rulesRepo.listAll(), existingRentals: [] }).ok;
}

// Re-reads every rental fresh (never trusts the client's row) and checks
// the requested transition against allowedActions before anything else
// runs, so a stale page or a direct call can't walk a status past what the
// buttons would ever offer.
async function loadForAction(
  id: string,
  action: BookingAction,
): Promise<Outcome<{ rental: RentalSummary; all: RentalSummary[] }>> {
  const all = await rentalRepo.listAll();
  const rental = all.find((r) => r.id === id);
  if (!rental) return fail("NOT_FOUND", "找不到這筆預約");
  const allowed = checkActionAllowed(rental, action);
  if (!allowed.ok) return allowed;
  return ok({ rental, all });
}

// The one place every action writes through. `rental` must be the row the
// caller just (re-)read — its status/paymentState become the guard. Zero
// rows updated means something else changed this booking first; the
// caller never retries here, since retrying would mean re-deciding `patch`
// against data this call already discarded.
async function applyTransition(rental: RentalSummary, patch: StatusPatch): Promise<Outcome> {
  const applied = await rentalRepo.transition(
    rental.id,
    { status: rental.status, paymentState: rental.paymentState },
    patch,
  );
  return applied ? ok() : fail("ABORTED", STALE_BOOKING);
}

// confirm and markPaid both decide from every rental in the room
// (planConfirm's rivals, findRegisteredOverlaps), which transition()'s
// per-row guard doesn't cover. Locking the room (RentalRepository.lockRoom,
// the same key create_booking_batch uses) serializes that cross-row read
// against another confirm/markPaid on the same room, so the re-read inside
// `run` sees a settled state. markDone/postpone/cancel need no lock: each
// decides from its own row alone, which transition() already guards.
function withRoomLock<T>(room: "A" | "B", run: () => Promise<T>): Promise<T> {
  return withTransaction(async () => {
    await rentalRepo.lockRoom(room);
    return run();
  });
}

export type BookingActionResult = Sealed;
export type ConfirmBookingResult = Sealed<null, { blockers: { conflicts: RentalSummary[] } }>;

// T-確認: no rivals -> confirm; rivals and no cancelIds -> report them for
// the dialog; rivals and matching cancelIds -> confirm this one and cancel
// the rest in one write (RentalRepository.confirmWithCancellations). If the
// fresh rivals no longer match cancelIds — someone else acted on this room
// in between — this refuses the same way a lost transition() race does,
// rather than opening yet another dialog.
export async function confirmBooking(id: string, cancelIds?: string[]): Promise<ConfirmBookingResult> {
  return runAction({ attempted: "確認預約", access: "staff", revalidate: REVALIDATE }, async () => {
    const existing = await rentalRepo.findById(id);
    if (!existing) return fail("NOT_FOUND", "找不到這筆預約");

    return withRoomLock(existing.room, async () => {
      const loaded = await loadForAction(id, "confirm");
      if (!loaded.ok) return loaded;
      const { rental, all } = loaded.data;
      if (!(await stillRentable(rental))) return fail("FAILED_PRECONDITION", NO_LONGER_RENTABLE);

      const plan = planConfirm(rental, all, cancelIds);
      if (plan.kind === "conflicts") {
        if (cancelIds) return fail("ABORTED", STALE_BOOKING);
        return failBlockers(
          "FAILED_PRECONDITION",
          `跟 ${plan.conflicts.length} 筆預約時間重疊，請先取消或延期下面這幾筆，再回來確認`,
          { conflicts: plan.conflicts },
        );
      }
      if (plan.cancellations.length === 0) return applyTransition(rental, { status: plan.nextStatus });
      await rentalRepo.confirmWithCancellations(rental.id, plan.nextStatus, plan.cancellations);
      return ok();
    });
  });
}

// T-付款: AwaitingPayment -> Registered+Paid, or Registered+Unpaid ->
// Registered+Paid, in the one guarded write. findRegisteredOverlaps stays
// a pre-write safety net against a different row's registered rival; the
// room lock is what keeps that read from racing another markPaid/confirm
// on the same room.
export async function markBookingPaid(id: string): Promise<BookingActionResult> {
  return runAction({ attempted: "標記已付款", access: "staff", revalidate: REVALIDATE }, async () => {
    const existing = await rentalRepo.findById(id);
    if (!existing) return fail("NOT_FOUND", "找不到這筆預約");

    return withRoomLock(existing.room, async () => {
      const loaded = await loadForAction(id, "markPaid");
      if (!loaded.ok) return loaded;
      const { rental, all } = loaded.data;
      if (rental.status !== RentalStatus.Registered && !(await stillRentable(rental))) {
        return fail("FAILED_PRECONDITION", NO_LONGER_RENTABLE);
      }
      const clash = findRegisteredOverlaps(rental, all);
      if (clash.length) {
        return fail("FAILED_PRECONDITION", `跟已登記的預約重疊：${clash.map(describeRental).join("、")}`);
      }
      return applyTransition(rental, { status: RentalStatus.Registered, paymentState: PaymentState.Paid });
    });
  });
}

export async function markBookingDone(id: string): Promise<BookingActionResult> {
  return runAction({ attempted: "標記完成", access: "staff", revalidate: REVALIDATE }, async () => {
    const loaded = await loadForAction(id, "markDone");
    if (!loaded.ok) return loaded;
    return applyTransition(loaded.data.rental, { status: RentalStatus.Completed });
  });
}

// T-延取: both terminal; the slot releases immediately. A paid booking's
// note gains the refund marker (cancellationFor); paymentState is left as
// paid (the money already moved, the refund itself is a manual step this
// app doesn't track yet).
function endBooking(id: string, action: "postpone" | "cancel"): Promise<BookingActionResult> {
  const attempted = action === "postpone" ? "延期預約" : "取消預約";
  return runAction({ attempted, access: "staff", revalidate: REVALIDATE }, async () => {
    const loaded = await loadForAction(id, action);
    if (!loaded.ok) return loaded;
    const { rental } = loaded.data;
    const { note } = cancellationFor(rental);
    const nextStatus = action === "postpone" ? RentalStatus.Postponed : RentalStatus.Cancelled;
    return applyTransition(rental, { status: nextStatus, note });
  });
}

export async function postponeBooking(id: string): Promise<BookingActionResult> {
  return endBooking(id, "postpone");
}

export async function cancelBooking(id: string): Promise<BookingActionResult> {
  return endBooking(id, "cancel");
}

function describeRental(r: RentalSummary): string {
  return `${r.person} ${r.date} ${r.start}–${r.end}`;
}
