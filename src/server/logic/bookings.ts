import { fail, ok, type Outcome } from "@/lib/result";
import { PaymentMethod, PaymentState, RentalStatus } from "@/server/types/home";
import type { RentalSummary } from "@/server/types/home";
import { rentalTouchesDate } from "@/server/logic/home-selectors";
import { addDays, isIsoDate } from "@/server/logic/date";
import { intervalsOverlap } from "@/server/supabase/codecs";

export interface BookingFilters {
  q?: string;
  // T-列表-5/7: any of these; empty or missing means every status.
  statuses?: RentalStatus[];
  // "none" matches free bookings, whose payment method is empty (T-列表-1).
  pay?: PaymentMethod | "none";
  from?: string;
  to?: string;
}

const STATUS_ORDER: Record<RentalStatus, number> = {
  [RentalStatus.Pending]: 0,
  [RentalStatus.AwaitingPayment]: 1,
  [RentalStatus.Registered]: 2,
  [RentalStatus.Completed]: 3,
  [RentalStatus.Postponed]: 4,
  [RentalStatus.Cancelled]: 5,
};

function matchesQuery(rental: RentalSummary, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return (
    rental.person.toLowerCase().includes(needle) ||
    rental.id.toLowerCase().includes(needle)
  );
}

function matchesStatus(rental: RentalSummary, statuses: BookingFilters["statuses"]): boolean {
  return !statuses?.length || statuses.includes(rental.status);
}

function matchesPay(rental: RentalSummary, pay: BookingFilters["pay"]): boolean {
  if (!pay) return true;
  return pay === "none" ? rental.paymentMethod === null : rental.paymentMethod === pay;
}

// T-列表-2: a cross-midnight rental belongs to both days it touches, the
// same rule the home page uses.
function touchedDays(rental: RentalSummary): string[] {
  const nextDay = addDays(rental.date, 1);
  return rental.isCrossMidnight && rentalTouchesDate(rental, nextDay) ? [rental.date, nextDay] : [rental.date];
}

function withinDateRange(rental: RentalSummary, from?: string, to?: string): boolean {
  return touchedDays(rental).some((day) => (!from || day >= from) && (!to || day <= to));
}

// T-列表-6: 預約追蹤 opens on what still needs confirming (待確認 only, not
// 待付款).
export const DEFAULT_STATUS_FILTER: RentalStatus[] = [RentalStatus.Pending];

export const ALL_STATUSES: RentalStatus[] = [
  RentalStatus.Pending,
  RentalStatus.AwaitingPayment,
  RentalStatus.Registered,
  RentalStatus.Completed,
  RentalStatus.Postponed,
  RentalStatus.Cancelled,
];

// The filter bar's state. Filters live only on the page: nothing is
// remembered, and a reload starts from the default. Edits stay a draft
// until 查詢 applies them.
export interface BookingFilterDraft {
  q: string;
  pay: string;
  statuses: RentalStatus[];
  from: string;
  to: string;
}

// The filters 預約追蹤 opens with: the default, or — when 首頁's ↗ passes a
// day (HM21) — that day with every status ticked. A malformed day is ignored.
export function initialBookingFilters(day?: string): BookingFilterDraft {
  const base = { q: "", pay: "", statuses: DEFAULT_STATUS_FILTER, from: "", to: "" };
  return day && isIsoDate(day) ? { ...base, statuses: ALL_STATUSES, from: day, to: day } : base;
}

// HM21: 今日租借's ↗ opens 預約追蹤 on that one day, every status ticked, so
// 櫃檯 can mark payment and completion there (the home page only displays).
export function bookingsUrlForDay(date: string): string {
  return `/bookings?${new URLSearchParams({ day: date }).toString()}`;
}

// B1: search + filter (status/pay/date range, all stackable) + sort by
// status priority, then date, then start time.
export function selectBookingRows(
  bookings: RentalSummary[],
  filters: BookingFilters,
): RentalSummary[] {
  return bookings
    .filter((r) => matchesQuery(r, filters.q ?? ""))
    .filter((r) => matchesStatus(r, filters.statuses))
    .filter((r) => matchesPay(r, filters.pay))
    .filter((r) => withinDateRange(r, filters.from, filters.to))
    .sort(
      (a, b) =>
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
        a.date.localeCompare(b.date) ||
        a.start.localeCompare(b.start),
    );
}

// --- status transitions -------------------------------------------------------

export type BookingAction = "confirm" | "markPaid" | "markDone" | "postpone" | "cancel";

const ACTION_LABEL: Record<BookingAction, string> = {
  confirm: "確認",
  markPaid: "標記已付款",
  markDone: "標記完成",
  postpone: "延期",
  cancel: "取消",
};

// T-按鈕-1..5: the single source of truth for which buttons show and which
// operations the server accepts.
export function allowedActions(rental: RentalSummary): BookingAction[] {
  switch (rental.status) {
    case RentalStatus.Pending:
      return ["confirm", "postpone", "cancel"];
    case RentalStatus.AwaitingPayment:
      return ["markPaid", "postpone", "cancel"];
    case RentalStatus.Registered:
      return rental.paymentState === PaymentState.Unpaid
        ? ["markPaid", "postpone", "cancel"]
        : ["markDone", "postpone", "cancel"];
    case RentalStatus.Completed:
    case RentalStatus.Postponed:
    case RentalStatus.Cancelled:
      return [];
  }
}

export function checkActionAllowed(
  rental: RentalSummary,
  action: BookingAction,
): Outcome {
  return allowedActions(rental).includes(action) ? ok() : fail("FAILED_PRECONDITION", `目前狀態不能${ACTION_LABEL[action]}`);
}

// T-確認-1: confirming never recalculates anything, only moves the status.
// Transfers wait for the money; on-site and free bookings register directly.
export function nextStatusOnConfirm(rental: RentalSummary): RentalStatus {
  return rental.paymentMethod === PaymentMethod.Transfer
    ? RentalStatus.AwaitingPayment
    : RentalStatus.Registered;
}

function overlapsInSameRoom(a: RentalSummary, b: RentalSummary): boolean {
  return (
    a.id !== b.id &&
    a.room === b.room &&
    intervalsOverlap(
      { startsAt: new Date(a.startsAt), endsAt: new Date(a.endsAt) },
      { startsAt: new Date(b.startsAt), endsAt: new Date(b.endsAt) },
    )
  );
}

const CONFIRM_RIVAL_STATUSES = new Set<RentalStatus>([
  RentalStatus.Pending,
  RentalStatus.AwaitingPayment,
  RentalStatus.Registered,
]);

// T-確認-2/3: same-room, overlapping rentals still holding (or about to hold)
// the slot, oldest submission first.
function findConfirmRivals(rental: RentalSummary, all: RentalSummary[]): RentalSummary[] {
  return all
    .filter((o) => CONFIRM_RIVAL_STATUSES.has(o.status) && overlapsInSameRoom(o, rental))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

// T-付款-2: a safety net when marking paid — normally conflicts were already
// resolved at confirm time.
export function findRegisteredOverlaps(rental: RentalSummary, all: RentalSummary[]): RentalSummary[] {
  return all.filter((o) => o.status === RentalStatus.Registered && overlapsInSameRoom(o, rental));
}

// T-延取-3/4
export function needsRefund(rental: RentalSummary): boolean {
  return rental.paymentState === PaymentState.Paid && (rental.amount ?? 0) > 0;
}

export function withRefundNote(note: string): string {
  return `${note}【需要退款】`;
}

export type Cancellation = { id: string; note: string };

// Status change for postpone/cancel: the note gains a refund marker when
// money has to go back; payment_state stays paid (T-延取-3).
export function cancellationFor(rental: RentalSummary): Cancellation {
  return { id: rental.id, note: needsRefund(rental) ? withRefundNote(rental.note) : rental.note };
}

// T-確認-3: the conflict dialog lists this booking together with its rivals,
// all ordered by submission time, with the one being kept marked.
export function conflictDialogRows(
  rental: RentalSummary,
  conflicts: RentalSummary[],
): Array<{ rental: RentalSummary; keep: boolean }> {
  return [rental, ...conflicts]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((r) => ({ rental: r, keep: r.id === rental.id }));
}

export type ConfirmPlan =
  | { kind: "conflicts"; conflicts: RentalSummary[] }
  | { kind: "confirm"; nextStatus: RentalStatus; cancellations: Cancellation[] };

function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && [...a].sort().join("\n") === [...b].sort().join("\n");
}

// T-確認-2..6: with no rivals, confirm directly. With rivals, the first call
// (no cancelIds) only reports them for the dialog; the follow-up call carries
// the ids the user agreed to cancel and goes ahead only if they still match
// the server's fresh view, so nothing changes behind the user's back.
export function planConfirm(rental: RentalSummary, all: RentalSummary[], cancelIds?: string[]): ConfirmPlan {
  const rivals = findConfirmRivals(rental, all);
  if (rivals.length > 0 && !(cancelIds && sameIds(cancelIds, rivals.map((r) => r.id)))) {
    return { kind: "conflicts", conflicts: rivals };
  }
  return {
    kind: "confirm",
    nextStatus: nextStatusOnConfirm(rental),
    cancellations: rivals.map(cancellationFor),
  };
}
