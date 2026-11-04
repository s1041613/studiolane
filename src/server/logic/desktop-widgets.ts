import { RentalStatus } from "@/server/types/home";
import type { RentalSummary } from "@/server/types/home";
import { rentalTouchesDate } from "@/server/logic/home-selectors";
import { clipWindowsToNow, getAvailableWindows, toMinutes } from "@/server/logic/booking-rules";
import type { RuleContext } from "@/server/logic/booking-rules";
import type { TimeWindow } from "@/server/logic/booking";
import { todayIso } from "@/server/logic/date";

// Rentals that no longer hold the room never show on the desktop widgets.
const OFF_THE_DAY: RentalStatus[] = [RentalStatus.Postponed, RentalStatus.Cancelled];

// 今日教室: every rental that touches `today` and still holds its room —
// confirmed or not, finished or not — in start order.
export function selectTodayRentals(rentals: readonly RentalSummary[], today: string): RentalSummary[] {
  return rentals
    .filter((rental) => !OFF_THE_DAY.includes(rental.status) && rentalTouchesDate(rental, today))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export type RentalPhase = "past" | "current" | "upcoming";

export function rentalPhase(rental: RentalSummary, now: Date): RentalPhase {
  if (now >= new Date(rental.endsAt)) return "past";
  if (now >= new Date(rental.startsAt)) return "current";
  return "upcoming";
}

// The row 今日教室 tints: the rental under way, or else the next to start.
export function spotlightRental(todayRentals: readonly RentalSummary[], now: Date): RentalSummary | null {
  return (
    todayRentals.find((rental) => rentalPhase(rental, now) === "current") ??
    todayRentals.find((rental) => rentalPhase(rental, now) === "upcoming") ??
    null
  );
}

// Rentals that still need staff attention, named by their status in the row.
export function needsAttention(rental: RentalSummary): boolean {
  return rental.status === RentalStatus.Pending || rental.status === RentalStatus.AwaitingPayment;
}

// 待付款: every rental in status 待付款, whatever its date.
export function countAwaitingPayment(rentals: readonly RentalSummary[]): number {
  return rentals.filter((rental) => rental.status === RentalStatus.AwaitingPayment).length;
}

// Bookings run in half-hour steps, so a shorter gap can't be rented.
const MIN_FREE_MINUTES = 30;

// 下一個空檔: the room's first rentable window left today, from the next half
// hour on, at least 30 minutes long — the same windows the booking form
// offers (rental rules minus registered rentals). Null when nothing is left.
export function nextFreeSlot(room: "A" | "B", now: Date, ctx: RuleContext): TimeWindow | null {
  const today = todayIso(now);
  const windows = clipWindowsToNow(getAvailableWindows(room, today, ctx), today, now);
  return windows.find((window) => toMinutes(window.end) - toMinutes(window.start) >= MIN_FREE_MINUTES) ?? null;
}
