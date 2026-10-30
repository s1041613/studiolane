import type { PurposeCode, RoleCode } from "@/server/supabase/codecs";

export type IsoDate = string; // "2026-10-16"
export type HHmm = string; // "18:30"

export type Purpose = PurposeCode;

export type SlotDraft = {
  date: IsoDate;
  start: HHmm;
  end: HHmm;
  // Set only by the "跨日" checkbox in the UI, never inferred from end < start
  // (same-day input errors like 14:00->13:00 also satisfy end < start).
  isCrossMidnight: boolean;
};

// D5/D6: the renter is either an existing roster member (identified by
// UUID, not name — names aren't unique) or a customer with a freely-typed
// name and no roster row at all. `role` drives which purposes the form
// offers; the server re-reads it from the roster by id (S-4) rather than
// trusting this value.
export type RenterSelection =
  | { type: "roster"; id: string; name: string; role: RoleCode }
  | { type: "customer"; name: string };

export type PaymentChoice = "transfer" | "on_site";

// The form's state as submitted. Fields the user hasn't filled yet are null
// so that validateBookingDraft can report every missing field at once (S-1).
export type BookingDraft = {
  room: "A" | "B";
  renter: RenterSelection | null;
  slots: SlotDraft[];
  purpose: Purpose | null;
  // Ignored when the booking costs 0, which is always written with no payment method.
  payment: PaymentChoice | null;
  note?: string;
};

export type CheckResult = { ok: true } | { ok: false; reason: string; ruleId?: string };

export type TimeWindow = { start: HHmm; end: HHmm };
