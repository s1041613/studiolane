import { describe, expect, it } from "vitest";
import { buildKobeyeeReviews } from "@/server/logic/kobeyee-review";
import type { KobeyeeReviewContext } from "@/server/logic/kobeyee-review";
import type { KobeyeeParse, KobeyeeTask, ParsedSlot } from "@/server/logic/kobeyee-parse";
import { SAMPLE_RULES, makeRental } from "@/server/logic/test-fixtures";
import { RentalStatus } from "@/server/types/home";

// Fixed "today" so date resolution (明天, closest-year absolute dates, past
// dates) is deterministic. A Wednesday; irrelevant here since SAMPLE_RULES's
// room B blocks (R5/R6) apply every weekday.
const TODAY = "2026-11-04";

function slot(day: number, overrides: Partial<ParsedSlot> = {}): ParsedSlot {
  return { date: { kind: "absolute", month: 11, day, year: null }, start: "10:00", end: "12:00", quote: "", ...overrides };
}

function ctx(overrides: Partial<KobeyeeReviewContext> = {}): KobeyeeReviewContext {
  return { today: TODAY, rules: SAMPLE_RULES, existingRentals: [], ...overrides };
}

function parse(tasks: KobeyeeTask[]): KobeyeeParse {
  return { tasks };
}

describe("buildKobeyeeReviews", () => {
  it("marks five legal slots in 小教室 and asks only for the renter", () => {
    const task: KobeyeeTask = {
      intent: "new_rental",
      room: "B",
      purpose: null,
      slots: [slot(10), slot(11), slot(12), slot(13), slot(14)],
    };
    const [review] = buildKobeyeeReviews(parse([task]), ctx());

    expect(review.slots.every((s) => s.state === "legal")).toBe(true);
    expect(review.draft.slots).toHaveLength(5);
    expect(review.draft.room).toBe("B");
    expect(review.questions).toEqual([{ kind: "renter" }]);
  });

  it("blocks a past date with a reason and keeps it out of the draft", () => {
    const task: KobeyeeTask = { intent: "new_rental", room: "B", purpose: null, slots: [slot(1)] }; // Nov 1, before TODAY
    const [review] = buildKobeyeeReviews(parse([task]), ctx());

    expect(review.slots[0]).toMatchObject({ state: "blocked", reason: "已過期" });
    expect(review.draft.slots).toHaveLength(0);
  });

  it("resolves 明天 to the day after today", () => {
    const task: KobeyeeTask = {
      intent: "new_rental",
      room: "B",
      purpose: null,
      slots: [{ date: { kind: "relative_day", offset: 1 }, start: "10:00", end: "12:00", quote: "明天" }],
    };
    const [review] = buildKobeyeeReviews(parse([task]), ctx());

    expect(review.slots[0]).toMatchObject({ state: "legal", slot: { date: "2026-11-05" } });
  });

  it("carries the private_lesson purpose into the draft", () => {
    const task: KobeyeeTask = { intent: "new_rental", room: "B", purpose: "private_lesson", slots: [slot(10)] };
    const [review] = buildKobeyeeReviews(parse([task]), ctx());

    expect(review.draft.purpose).toBe("private_lesson");
  });

  it("builds a review for availability_question without a purpose or old bookings", () => {
    const task: KobeyeeTask = { intent: "availability_question", room: "B", slots: [slot(10)] };
    const [review] = buildKobeyeeReviews(parse([task]), ctx());

    expect(review.intent).toBe("availability_question");
    expect(review.draft.purpose).toBeNull();
    expect(review.oldBookings).toEqual([]);
  });

  it("asks for the room and defaults the draft to 小教室 when room is unread", () => {
    const task: KobeyeeTask = { intent: "new_rental", room: null, purpose: null, slots: [slot(10)] };
    const [review] = buildKobeyeeReviews(parse([task]), ctx());

    expect(review.draft.room).toBe("B");
    expect(review.questions).toEqual(expect.arrayContaining([{ kind: "room" }]));
  });

  it("marks a slot with no usable time incomplete and asks for the time", () => {
    const task: KobeyeeTask = {
      intent: "new_rental",
      room: "B",
      purpose: null,
      slots: [slot(10, { start: null, end: null })],
    };
    const [review] = buildKobeyeeReviews(parse([task]), ctx());

    expect(review.slots[0]).toMatchObject({ state: "incomplete", start: null, end: null });
    expect(review.questions).toEqual(expect.arrayContaining([{ kind: "time", slotIndex: 0 }]));
  });

  it("asks for a date when the message named no day at all", () => {
    const task: KobeyeeTask = { intent: "new_rental", room: "B", purpose: null, slots: [] };
    const [review] = buildKobeyeeReviews(parse([task]), ctx());

    expect(review.slots).toEqual([]);
    expect(review.questions).toEqual(expect.arrayContaining([{ kind: "date" }]));
  });

  it("flags an overlap with an existing hold and keeps it out of the draft", () => {
    const existing = makeRental({ id: "r1", date: "2026-11-10", start: "10:30", end: "11:30", room: "B", status: RentalStatus.Pending });
    const task: KobeyeeTask = { intent: "new_rental", room: "B", purpose: null, slots: [slot(10)] };
    const [review] = buildKobeyeeReviews(parse([task]), ctx({ existingRentals: [existing] }));

    expect(review.slots[0].state).toBe("overlap");
    expect(review.questions).toEqual(expect.arrayContaining([{ kind: "overlap", slotIndex: 0 }]));
    expect(review.draft.slots).toHaveLength(0);
  });

  it("blocks a slot that falls inside a rental rule's blocked window", () => {
    // SAMPLE_RULES' R5 blocks room B 13:30-14:00 every day (準備時間).
    const task: KobeyeeTask = {
      intent: "new_rental",
      room: "B",
      purpose: null,
      slots: [slot(10, { start: "13:30", end: "14:00" })],
    };
    const [review] = buildKobeyeeReviews(parse([task]), ctx());

    expect(review.slots[0]).toMatchObject({ state: "blocked", reason: "11/10 13:30–14:00：準備時間" });
    expect(review.draft.slots).toHaveLength(0);
  });

  it("builds a cancellation review without crashing", () => {
    const task: KobeyeeTask = { intent: "cancellation", room: "B", oldSlots: [slot(10)] };
    const [review] = buildKobeyeeReviews(parse([task]), ctx());

    expect(review.intent).toBe("cancellation");
    expect(review.slots).toEqual([]);
    expect(review.oldBookings).toEqual([]);
    expect(review.questions).toEqual(expect.arrayContaining([{ kind: "renter" }]));
  });

  it("builds a reschedule review without crashing", () => {
    const task: KobeyeeTask = { intent: "reschedule", room: "B", oldSlots: [slot(5)], slots: [slot(12)] };
    const [review] = buildKobeyeeReviews(parse([task]), ctx());

    expect(review.intent).toBe("reschedule");
    expect(review.slots[0].state).toBe("legal");
    expect(review.oldBookings).toEqual([]);
  });
});
