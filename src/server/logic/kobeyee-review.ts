// Turns one AI read (KobeyeeParse) into what the chat renders (KobeyeeReview[]):
// a SlotReview per slot, the draft the booking form would start from, and the
// questions staff still need to answer. Pure: every rule and conflict check
// reuses booking-rules.ts and booking-conflicts.ts's shapes, never
// reimplemented here (docs/desktop-ai-assistant/extraction-contract.md).
import { checkBooking } from "@/server/logic/booking-rules";
import type { RuleContext } from "@/server/logic/booking-rules";
import type { BookingConflict } from "@/server/logic/booking-conflicts";
import type { BookingDraft, IsoDate, Purpose, SlotDraft } from "@/server/logic/booking";
import { resolveDateMention } from "@/server/logic/date-mention";
import type { KobeyeeParse, KobeyeeTask, ParsedSlot, Room } from "@/server/logic/kobeyee-parse";
import type { KobeyeeQuestion, KobeyeeReview, SlotReview } from "@/server/logic/kobeyee";
import { RentalStatus } from "@/server/types/home";
import type { RentalSummary } from "@/server/types/home";
import { intervalsOverlap, toStartsEndsAt } from "@/server/supabase/codecs";

// checkBooking already needs rules + existingRentals (RuleContext); `today`
// is this module's own addition, for resolveDateMention and for marking a
// slot blocked once its date has already passed (checkBooking has no notion
// of "today", only of which minutes a day's rules leave open).
export type KobeyeeReviewContext = RuleContext & { today: IsoDate };

// Decision: an unnamed room defaults to 小教室 (B) rather than leaving the
// draft unroomed, so staff only have to confirm it, not fill it from scratch.
const DEFAULT_ROOM: Room = "B";

export function buildKobeyeeReviews(parse: KobeyeeParse, ctx: KobeyeeReviewContext): KobeyeeReview[] {
  return parse.tasks.map((task) => buildReview(task, ctx));
}

function buildReview(task: KobeyeeTask, ctx: KobeyeeReviewContext): KobeyeeReview {
  const room = task.room ?? DEFAULT_ROOM;
  switch (task.intent) {
    case "new_rental":
      return reviewFromSlots(task, room, task.slots, task.purpose, ctx);
    case "availability_question":
      return reviewFromSlots(task, room, task.slots, null, ctx);
    case "reschedule":
      return reviewFromSlots(task, room, task.slots, null, ctx);
    case "cancellation":
      // Staff point at bookings to cancel and press 取消 themselves; which
      // existing rows task.oldSlots names is an M2 lookup, not this pass.
      return {
        intent: "cancellation",
        slots: [],
        draft: emptyDraft(room),
        oldBookings: [],
        questions: buildQuestions(task, [], false),
      };
  }
}

function reviewFromSlots(
  task: KobeyeeTask,
  room: Room,
  rawSlots: ParsedSlot[],
  purpose: Purpose | null,
  ctx: KobeyeeReviewContext,
): KobeyeeReview {
  const { slots, droppedForDate } = reviewSlots(rawSlots, room, ctx);
  // A new_rental/availability_question task that reads no slot at all (週末,
  // 月底: no single day to resolve) needs the same date question a dropped
  // impossible date would. reschedule's "new times" get the per-slot
  // question below instead; an empty new-times list there means nothing to
  // review yet, not a date to ask about.
  const endsWithNoSlots = (task.intent === "new_rental" || task.intent === "availability_question") && slots.length === 0;

  return {
    intent: task.intent,
    slots,
    draft: {
      room,
      renter: null,
      slots: slots.filter(isLegal).map((s) => s.slot),
      purpose,
      payment: "transfer",
    },
    oldBookings: [], // reschedule's "which booking to move" lookup lands in M2
    questions: buildQuestions(task, slots, droppedForDate || endsWithNoSlots),
  };
}

function emptyDraft(room: Room): BookingDraft {
  return { room, renter: null, slots: [], purpose: null, payment: "transfer" };
}

function isLegal(slot: SlotReview): slot is SlotReview & { state: "legal" } {
  return slot.state === "legal";
}

// Resolves and classifies every slot, dropping ones whose date can't exist
// (2026-02-30) rather than surfacing a SlotReview with nothing to show.
function reviewSlots(
  rawSlots: ParsedSlot[],
  room: Room,
  ctx: KobeyeeReviewContext,
): { slots: SlotReview[]; droppedForDate: boolean } {
  const slots: SlotReview[] = [];
  let droppedForDate = false;
  for (const raw of rawSlots) {
    const review = resolveAndClassifySlot(raw, room, ctx);
    if (review === null) {
      droppedForDate = true;
      continue;
    }
    slots.push(review);
  }
  return { slots, droppedForDate };
}

function resolveAndClassifySlot(parsed: ParsedSlot, room: Room, ctx: KobeyeeReviewContext): SlotReview | null {
  const resolution = resolveDateMention(parsed.date, ctx.today);
  if (resolution === null) return null;

  const evidence = { quote: parsed.quote, inferred: { year: resolution.inferredYear } };

  // 「8-9點」 with no 早/晚: there's a day but no usable time, so there's no
  // SlotDraft to check against the rules yet.
  if (parsed.start === null || parsed.end === null) {
    return { ...evidence, state: "incomplete", date: resolution.date, start: parsed.start, end: parsed.end };
  }

  // The model never reads a 跨日 checkbox; cross-midnight only exists once
  // staff type it in the form (see SlotDraft).
  const slot: SlotDraft = { date: resolution.date, start: parsed.start, end: parsed.end, isCrossMidnight: false };
  return { ...evidence, ...classifySlot(slot, room, ctx) };
}

type SlotOutcome =
  | { state: "legal"; slot: SlotDraft }
  | { state: "blocked"; slot: SlotDraft; reason: string; ruleId?: string }
  | { state: "overlap"; slot: SlotDraft; conflicts: BookingConflict[] };

function classifySlot(slot: SlotDraft, room: Room, ctx: KobeyeeReviewContext): SlotOutcome {
  // checkBooking only knows a day's open windows, not which day is "today",
  // so a past date would otherwise read as available whenever that weekday
  // isn't ruled out.
  if (slot.date < ctx.today) {
    return { state: "blocked", slot, reason: "已過期" };
  }

  const check = checkBooking(slot, room, ctx);
  if (!check.ok) {
    return { state: "blocked", slot, reason: check.reason, ruleId: check.ruleId };
  }

  const conflicts = overlappingConflicts(slot, room, ctx.existingRentals);
  if (conflicts.length > 0) {
    return { state: "overlap", slot, conflicts };
  }

  return { state: "legal", slot };
}

// Statuses still held but not a hard block (D4): a Registered overlap
// already failed checkBooking above, so anything reaching here is a
// pending or awaiting-payment hold staff can confirm past.
const HELD_NOT_REGISTERED = new Set<RentalStatus>([RentalStatus.Pending, RentalStatus.AwaitingPayment]);

function overlappingConflicts(slot: SlotDraft, room: Room, existingRentals: RentalSummary[]): BookingConflict[] {
  const interval = toStartsEndsAt(slot.date, slot.start, slot.end, slot.isCrossMidnight);
  return existingRentals
    .filter((r) => r.room === room && HELD_NOT_REGISTERED.has(r.status))
    .filter((r) => intervalsOverlap(interval, { startsAt: new Date(r.startsAt), endsAt: new Date(r.endsAt) }))
    .map((r) => ({ id: r.id, date: r.date, start: r.start, end: r.end, renterName: r.person, status: r.status }));
}

// Fixed order, matching the order staff would need to resolve them in chat:
// who's renting, then which room, then which date (when nothing could be
// read at all), then any slot that collided with someone else's hold, then
// any slot missing a clear start/end time.
function buildQuestions(task: KobeyeeTask, slots: SlotReview[], needsDateQuestion: boolean): KobeyeeQuestion[] {
  const overlapQuestions: KobeyeeQuestion[] = slots.flatMap((slot, slotIndex): KobeyeeQuestion[] =>
    slot.state === "overlap" ? [{ kind: "overlap", slotIndex }] : [],
  );
  const timeQuestions: KobeyeeQuestion[] = slots.flatMap((slot, slotIndex): KobeyeeQuestion[] =>
    slot.state === "incomplete" ? [{ kind: "time", slotIndex }] : [],
  );

  return [
    { kind: "renter" },
    ...(task.room === null ? ([{ kind: "room" }] as const) : []),
    ...(needsDateQuestion ? ([{ kind: "date" }] as const) : []),
    ...overlapQuestions,
    ...timeQuestions,
  ];
}
