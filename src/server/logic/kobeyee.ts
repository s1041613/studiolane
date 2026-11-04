// What the UI renders from one read LINE message (docs/desktop-ai-assistant/
// extraction-contract.md). Slot states, the draft and the questions are
// computed by backend logic, never by the model.
import type { BookingDraft, SlotDraft } from "@/server/logic/booking";
import type { BookingConflict } from "@/server/logic/booking-conflicts";
import type { RentalSummary } from "@/server/types/home";

export type KobeyeeIntent = "new_rental" | "reschedule" | "availability_question";

type SlotEvidence = {
  quote: string;
  inferred: { year: boolean };
};

export type SlotReview = SlotEvidence &
  (
    | { state: "legal"; slot: SlotDraft }
    | { state: "blocked"; slot: SlotDraft; reason: string; ruleId?: string }
    | { state: "overlap"; slot: SlotDraft; conflicts: BookingConflict[] }
  );

export type KobeyeeQuestion =
  | { kind: "overlap"; slotIndex: number }
  | { kind: "renter" }
  | { kind: "room" }
  | { kind: "time"; slotIndex: number }
  | { kind: "relativeDate"; slotIndex: number; alternatives: string[] }
  | { kind: "oldBooking"; oldSlotIndex: number; candidates: RentalSummary[] };

export type KobeyeeReview = {
  intent: KobeyeeIntent;
  slots: SlotReview[];
  // Legal slots only; renter null until staff pick one.
  draft: BookingDraft;
  oldBookings: RentalSummary[];
  questions: KobeyeeQuestion[];
};

export type KobeyeeResult = { status: "ok"; reviews: KobeyeeReview[] } | { status: "unreadable" };

// The booking form's rows in render order. The skeleton fill reveals them
// in this order, so the form and the reveal counter read the same list.
export const DRAFT_FIELDS = ["renter", "room", "dates", "times", "purpose", "payment", "note", "total"] as const;

export type DraftField = (typeof DRAFT_FIELDS)[number];
