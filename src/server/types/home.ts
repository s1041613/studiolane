import type { Result } from "@/lib/result";

// These enums hold the DB's English codes, not the Chinese labels the UI
// shows. Call sites that only ever compare against an enum member (e.g.
// `r.status === RentalStatus.Registered`) are unaffected by that; anything
// that needs the Chinese label for display goes through
// src/server/supabase/codecs.ts's *ToLabel functions.
export enum RentalStatus {
  Pending = "pending",
  AwaitingPayment = "awaiting_payment",
  Registered = "registered",
  Completed = "completed",
  Postponed = "postponed",
  Cancelled = "cancelled",
}

export enum PaymentMethod {
  OnSite = "on_site",
  Transfer = "transfer",
}

// NotRequired marks free bookings: their payment method is null, and the DB
// enforces null method <=> not_required.
export enum PaymentState {
  Unpaid = "unpaid",
  Paid = "paid",
  NotRequired = "not_required",
}

// The DB's `room` column is a single 'A' | 'B' value; two independent
// roomA/roomB booleans would let roomA===roomB===false or both-true slip
// past the type system.
//
// Carries both the DB code (`purpose`, `paymentMethod`) for domain
// comparisons/codec round-tripping, and the derived Taipei-local display
// fields (`date`/`start`/`end`/`weekday`, `purposeLabel`, `paymentMethodLabel`)
// so UI components keep rendering Chinese text without each one calling
// src/server/supabase/codecs.ts itself. The repository computes both halves
// once per row; see rental-repository.ts.
export interface RentalSummary {
  id: string;
  batchId: string | null;
  startsAt: string; // ISO instant (timestamptz)
  endsAt: string; // ISO instant (timestamptz)
  date: string; // derived, Asia/Taipei: ISO yyyy-mm-dd of startsAt
  weekday: string; // derived, Asia/Taipei
  start: string; // derived, Asia/Taipei: HH:mm of startsAt
  end: string; // derived, Asia/Taipei: HH:mm of endsAt
  isCrossMidnight: boolean; // derived: endsAt falls on a later Taipei date than startsAt
  room: "A" | "B";
  handler: string;
  // Present for both roster and customer renters (D5): the roster member's
  // display name, or the customer's freely-typed name.
  person: string;
  renterId: string | null; // roster.id; null when renterType === "customer"
  renterType: "roster" | "customer";
  purpose: string; // DB code, e.g. "private_lesson"
  purposeLabel: string; // derived Chinese label, e.g. "私課"
  paymentState: PaymentState;
  status: RentalStatus;
  note: string;
  paymentMethod: PaymentMethod | null; // null <=> paymentState === NotRequired
  paymentMethodLabel: string; // derived Chinese label, e.g. "現場繳費"; "—" when null
  amount: number | null;
  createdAt: string;
}

export interface HomeDashboard {
  todayRentals: Result<RentalSummary[]>;
  // Every rental, for the date-independent 預約追蹤 card (HM08/HM09).
  allRentals: Result<RentalSummary[]>;
}
