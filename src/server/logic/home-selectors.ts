import { PaymentMethod, PaymentState, RentalStatus } from "@/server/types/home";
import type { RentalSummary } from "@/server/types/home";
import { todayIso } from "@/server/logic/date";
import { intervalsOverlap, paymentStateToLabel, toStartsEndsAt } from "@/server/supabase/codecs";
import type { PaymentStateCode } from "@/server/supabase/codecs";

// D2: a rental's "day" is any calendar day its [startsAt, endsAt) interval
// intersects that day's [00:00, 24:00) window — not just the day startsAt
// falls on. A cross-midnight booking shows on both the night it starts and
// the morning it ends.
export function rentalTouchesDate(rental: RentalSummary, iso: string): boolean {
  const dayStart = toStartsEndsAt(iso, "00:00", "00:00", false).startsAt;
  const dayEnd = toStartsEndsAt(iso, "00:00", "00:00", true).endsAt; // next day's 00:00
  return intervalsOverlap(
    { startsAt: dayStart, endsAt: dayEnd },
    { startsAt: new Date(rental.startsAt), endsAt: new Date(rental.endsAt) },
  );
}

// F2: only registered rentals show on the day; ended-but-registered stay
// visible and are dimmed separately via isPast, not filtered out here.
export function selectRentalsForDate(
  items: RentalSummary[],
  iso: string,
): RentalSummary[] {
  return items
    .filter((r) => rentalTouchesDate(r, iso) && r.status === RentalStatus.Registered)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export function isPast(rental: RentalSummary, now: Date): boolean {
  return now > new Date(rental.endsAt);
}

// D3: half-open interval overlap on the real startsAt/endsAt instants,
// replacing the old same-`date`-string + string-time comparison that
// missed a cross-midnight rental's spillover into the next day.
function overlaps(a: RentalSummary, b: RentalSummary): boolean {
  return (
    a.room === b.room &&
    intervalsOverlap(
      { startsAt: new Date(a.startsAt), endsAt: new Date(a.endsAt) },
      { startsAt: new Date(b.startsAt), endsAt: new Date(b.endsAt) },
    )
  );
}

const CONFLICT_ELIGIBLE_STATUSES: RentalStatus[] = [
  RentalStatus.Pending,
  RentalStatus.AwaitingPayment,
];

// F4/B2/D4: only pending/awaiting-payment rentals participate in conflict
// ranking — registered, completed, postponed, and cancelled rentals never
// count as (or against) a conflict, regardless of what's in `list`.
export function conflictInfo(
  rental: RentalSummary,
  list: RentalSummary[],
): number | null {
  if (!CONFLICT_ELIGIBLE_STATUSES.includes(rental.status)) return null;
  const rivals = list.filter(
    (o) =>
      o !== rental &&
      CONFLICT_ELIGIBLE_STATUSES.includes(o.status) &&
      overlaps(o, rental),
  );
  if (!rivals.length) return null;
  const order = [rental, ...rivals]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .indexOf(rental);
  return order + 1;
}

// HM13: the payment status after a today card's subtitle, as coloured text.
// PaymentState's own values are exactly PaymentStateCode's, same as the
// repository mapping in rental-repository.ts.
export function paymentTag(rental: RentalSummary): string {
  return paymentStateToLabel(rental.paymentState as PaymentStateCode);
}

export function money(n: number): string {
  return n.toLocaleString("en-US");
}

export function roomLabel(rental: RentalSummary): string {
  return rental.room === "A" ? "大教室 A" : "小教室 B";
}

// Kept out of any "use client" module so server components (e.g. the
// settings pages' AffectedRentals) can call it too.
export function slotText(r: RentalSummary): string {
  return `${r.date} ${r.start}–${r.end}${r.isCrossMidnight ? "（跨日）" : ""}`;
}

// HM12/HM14: the line under the renter's name on a today card: time, room
// shortened to A/B, purpose. The card list is already one day, so no date.
export function rentalCardSubtitle(rental: RentalSummary): string {
  const time = `${rental.start}–${rental.end}${rental.isCrossMidnight ? "（跨日）" : ""}`;
  return [time, rental.room, rental.purposeLabel].join(" · ");
}

export interface HomeKpis {
  rentalCount: number;
  onSiteDue: number;
  pendingCount: number;
  pendingConflicts: number;
}

// HM05–HM09: the three home cards. `dayRentals` is the shown day's list
// (selectRentalsForDate); `allRentals` feeds the date-independent 預約追蹤
// card, which counts 待確認 from today on and how many of those clash.
export function homeKpis(dayRentals: RentalSummary[], allRentals: RentalSummary[]): HomeKpis {
  const onSiteDue = dayRentals
    .filter((r) => r.paymentMethod === PaymentMethod.OnSite && r.paymentState === PaymentState.Unpaid)
    .reduce((sum, r) => sum + (r.amount ?? 0), 0);
  const today = todayIso();
  const pending = allRentals.filter((r) => r.status === RentalStatus.Pending && r.date >= today);
  return {
    rentalCount: dayRentals.length,
    onSiteDue,
    pendingCount: pending.length,
    pendingConflicts: pending.filter((r) => conflictInfo(r, allRentals) != null).length,
  };
}

// F2: cross-midnight rentals show the raw end time; caller marks it
// "next day" in the UI rather than baking markup into this pure function.
export function isNextDay(rental: RentalSummary): boolean {
  return rental.isCrossMidnight;
}
