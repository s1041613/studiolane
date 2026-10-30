import { checkBooking } from "@/server/logic/booking-rules";
import type { RentalRule } from "@/server/logic/booking-rules";
import { upcomingRentals } from "@/server/logic/affected-rentals";
import type { RentalSummary } from "@/server/types/home";

// docs/rental-time-rules X1–X3: a change to 上課時段 or 租借規則 may not leave an
// existing booking (待確認、待付款、已登記, not yet started) in time that can no
// longer be rented. `before` and `after` are the whole rule list either side of
// the change; a booking is broken when it was rentable before and isn't after.
// Each booking is checked against every other booking, not itself, so one that
// already clashed with someone else's never counts as broken by the change.
export function rentalsBrokenBy(
  before: readonly RentalRule[],
  after: readonly RentalRule[],
  rentals: readonly RentalSummary[],
  now: Date,
): RentalSummary[] {
  const rentable = (rules: readonly RentalRule[], rental: RentalSummary) =>
    checkBooking(
      { date: rental.date, start: rental.start, end: rental.end, isCrossMidnight: rental.isCrossMidnight },
      rental.room,
      { rules: [...rules], existingRentals: rentals.filter((other) => other.id !== rental.id) },
    ).ok;

  return upcomingRentals(rentals, now).filter((rental) => rentable(before, rental) && !rentable(after, rental));
}

// 「這段時間有 1 筆預約，不能存」 and its archive／reactivate variants.
export function brokenRentalsMessage(count: number, action: "存" | "停用" | "啟用"): string {
  return `這段時間有 ${count} 筆預約，不能${action}`;
}
