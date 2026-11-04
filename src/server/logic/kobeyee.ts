// What the UI renders from one read LINE message (docs/desktop-ai-assistant/
// extraction-contract.md). Slot states, the draft and the questions are
// computed by backend logic, never by the model.
import type { BookingDraft, HHmm, IsoDate, SlotDraft } from "@/server/logic/booking";
import type { BookingConflict } from "@/server/logic/booking-conflicts";
import type { RentalSummary } from "@/server/types/home";

export type KobeyeeIntent = "new_rental" | "reschedule" | "availability_question" | "cancellation";

type SlotEvidence = {
  quote: string;
  inferred: { year: boolean };
};

export type SlotReview = SlotEvidence &
  (
    | { state: "legal"; slot: SlotDraft }
    | { state: "blocked"; slot: SlotDraft; reason: string; ruleId?: string }
    | { state: "overlap"; slot: SlotDraft; conflicts: BookingConflict[] }
    // The message gave a day but no usable time (「8-9點」 with no 早/晚), so
    // there is no SlotDraft to check yet; a `time` question points here.
    | { state: "incomplete"; date: IsoDate; start: HHmm | null; end: HHmm | null }
  );

export type KobeyeeQuestion =
  | { kind: "overlap"; slotIndex: number }
  | { kind: "renter" }
  | { kind: "room" }
  | { kind: "time"; slotIndex: number }
  // The message named no single day (週末, 月底), so there are no slots yet.
  | { kind: "date" }
  | { kind: "oldBooking"; oldSlotIndex: number; candidates: RentalSummary[] };

export type KobeyeeReview = {
  intent: KobeyeeIntent;
  slots: SlotReview[];
  // Legal slots only; renter null until staff pick one.
  draft: BookingDraft;
  oldBookings: RentalSummary[];
  questions: KobeyeeQuestion[];
};

// unreadable: the model saw no booking (or refused, or broke the schema).
// failed: the read itself did not finish (network, timeout, API error), so
// staff get a retry instead of "看不懂".
export type KobeyeeResult =
  | { status: "ok"; reviews: KobeyeeReview[] }
  | { status: "unreadable" }
  | { status: "failed" };

// The booking form's rows in render order. The skeleton fill reveals them
// in this order, so the form and the reveal counter read the same list.
export const DRAFT_FIELDS = ["renter", "room", "dates", "times", "purpose", "payment", "note", "total"] as const;

export type DraftField = (typeof DRAFT_FIELDS)[number];
