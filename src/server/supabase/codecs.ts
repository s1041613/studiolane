// Phase 1 of the Supabase migration plan (.lavish/supabase-migration-plan.html):
// isolated, unit-testable conversions between the DB's English enum codes /
// timestamptz columns and the application's Chinese-label / date+time-string
// domain shapes. Nothing here talks to Supabase or touches a repository —
// that wiring happens in Phase 3.

// --- purpose ---------------------------------------------------------------

export type PurposeCode =
  | "dance"
  | "private_lesson"
  | "performance"
  | "aerobics"
  | "front_desk"
  | "workshop"
  | "photography"
  | "yoga";

const PURPOSE_LABEL: Record<PurposeCode, string> = {
  dance: "舞蹈",
  private_lesson: "私課",
  performance: "展演",
  aerobics: "有氧",
  front_desk: "櫃檯使用",
  workshop: "作品班",
  photography: "其餘拍攝",
  yoga: "瑜珈",
};

export function purposeToLabel(code: PurposeCode): string {
  return PURPOSE_LABEL[code];
}

export function purposeFromLabel(label: string): PurposeCode | null {
  const entry = (Object.entries(PURPOSE_LABEL) as [PurposeCode, string][]).find(
    ([, l]) => l === label,
  );
  return entry ? entry[0] : null;
}

// --- role (pricing_plans.role / roster.role) --------------------------------
// R2 in the migration plan: this is the DB's "身分類型" (identity category).

// guest_teacher: outside teachers who cover classes; they are never offered
// as booking renters.
export type RoleCode = "teacher" | "staff" | "customer" | "guest_teacher";

const ROLE_LABEL: Record<RoleCode, string> = {
  teacher: "老師",
  staff: "櫃檯",
  customer: "客戶",
  guest_teacher: "外部老師",
};

export function roleToLabel(code: RoleCode): string {
  return ROLE_LABEL[code];
}

// --- rental_status -----------------------------------------------------------

export type RentalStatusCode =
  | "pending"
  | "awaiting_payment"
  | "registered"
  | "completed"
  | "postponed"
  | "cancelled";

const STATUS_LABEL: Record<RentalStatusCode, string> = {
  pending: "待確認",
  awaiting_payment: "待付款",
  registered: "已登記",
  completed: "已完成",
  postponed: "延期",
  cancelled: "已取消",
};

export function statusToLabel(code: RentalStatusCode): string {
  return STATUS_LABEL[code];
}

export function statusFromLabel(label: string): RentalStatusCode | null {
  const entry = (Object.entries(STATUS_LABEL) as [RentalStatusCode, string][]).find(
    ([, l]) => l === label,
  );
  return entry ? entry[0] : null;
}

// --- payment_state -----------------------------------------------------------

// "未付款" rather than "待付款" so it never collides with the rental status
// awaiting_payment, which is also labelled 待付款.
export type PaymentStateCode = "unpaid" | "paid" | "not_required";

const PAYMENT_STATE_LABEL: Record<PaymentStateCode, string> = {
  unpaid: "未付款",
  paid: "已付款",
  not_required: "無需付款",
};

export function paymentStateToLabel(code: PaymentStateCode): string {
  return PAYMENT_STATE_LABEL[code];
}

export function paymentStateFromLabel(label: string): PaymentStateCode | null {
  const entry = (Object.entries(PAYMENT_STATE_LABEL) as [PaymentStateCode, string][]).find(
    ([, l]) => l === label,
  );
  return entry ? entry[0] : null;
}

// --- payment_method ----------------------------------------------------------
// A free booking has a null payment method; payment_state = not_required
// marks that no payment is owed.

export type PaymentMethodCode = "on_site" | "transfer";

const PAYMENT_METHOD_LABEL: Record<PaymentMethodCode, string> = {
  on_site: "現場繳費",
  transfer: "轉帳",
};

export function paymentMethodToLabel(code: PaymentMethodCode): string {
  return PAYMENT_METHOD_LABEL[code];
}

// T-列表-3: an empty payment method renders as a dash.
export function paymentMethodLabelOrDash(code: PaymentMethodCode | null): string {
  return code === null ? "—" : PAYMENT_METHOD_LABEL[code];
}

export function paymentMethodFromLabel(label: string): PaymentMethodCode | null {
  const entry = (
    Object.entries(PAYMENT_METHOD_LABEL) as [PaymentMethodCode, string][]
  ).find(([, l]) => l === label);
  return entry ? entry[0] : null;
}

// --- date/start/end/isCrossMidnight <-> starts_at/ends_at -------------------
//
// The booking form keeps sending date + start + end + a cross-midnight flag
// (D2/D3 plan decisions keep the form UX as-is); the backend is responsible
// for converting to/from the DB's timestamptz instants. isCrossMidnight is
// read verbatim, never inferred from end <= start — a same-day input error
// like 14:00->13:00 also satisfies end <= start, and inferring would hide
// that mistake instead of rejecting it upstream in validation.

export type IsoDate = string; // "2026-10-16"
export type HHmm = string; // "18:30"

export type DateTimeInterval = {
  startsAt: Date;
  endsAt: Date;
};

function combineDateAndTime(date: IsoDate, time: HHmm): Date {
  return new Date(`${date}T${time}:00+08:00`);
}

export function toStartsEndsAt(
  date: IsoDate,
  start: HHmm,
  end: HHmm,
  isCrossMidnight: boolean,
): DateTimeInterval {
  const startsAt = combineDateAndTime(date, start);
  let endsAt = combineDateAndTime(date, end);
  if (isCrossMidnight) {
    endsAt = new Date(endsAt.getTime() + 24 * 60 * 60 * 1000);
  }
  return { startsAt, endsAt };
}

// rentals.created_at is still a naive `timestamp` holding UTC (both the
// now() default and the app's toISOString() writes are UTC; Postgres drops
// the Z). Re-attach it so readers don't parse the value as local time.
export function fromNaiveUtcTimestamp(value: string): string {
  return new Date(`${value}Z`).toISOString();
}

function formatInTaipei(d: Date, pattern: "date" | "time"): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  if (pattern === "date") return `${get("year")}-${get("month")}-${get("day")}`;
  return `${get("hour")}:${get("minute")}`;
}

// Inverse of toStartsEndsAt: given the stored instant, recover the
// Asia/Taipei wall-clock date/start/end pair the UI should show, plus
// whether the booking crosses midnight (endsAt falls on a later Taipei date
// than startsAt).
export function fromStartsEndsAt(interval: DateTimeInterval): {
  date: IsoDate;
  start: HHmm;
  end: HHmm;
  isCrossMidnight: boolean;
} {
  const date = formatInTaipei(interval.startsAt, "date");
  const start = formatInTaipei(interval.startsAt, "time");
  const end = formatInTaipei(interval.endsAt, "time");
  const isCrossMidnight = formatInTaipei(interval.endsAt, "date") !== date;
  return { date, start, end, isCrossMidnight };
}

// --- interval overlap --------------------------------------------------------
//
// D3: half-open interval overlap, [start, end). Two bookings that merely
// touch (A ends exactly when B starts) do not overlap. This is the one
// comparison every conflict-detection call site (home-selectors.overlaps,
// booking-rules.blockedRanges, bookings.planConfirm) should route through
// instead of re-deriving it against date+string-time fields.
export function intervalsOverlap(a: DateTimeInterval, b: DateTimeInterval): boolean {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}
