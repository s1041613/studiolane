import { describe, expect, it } from "vitest";
import { scoreKobeyeeParse } from "@/server/logic/kobeyee-eval-scorer";
import type { DateMention, KobeyeeParse, ParsedSlot } from "@/server/logic/kobeyee-parse";

function slot(date: DateMention, start: string | null, end: string | null): ParsedSlot {
  return { date, start, end, quote: "unused in scoring" };
}

const ABSOLUTE_11_10: DateMention = { kind: "absolute", month: 11, day: 10, year: null };
const ABSOLUTE_11_11: DateMention = { kind: "absolute", month: 11, day: 11, year: null };

describe("scoreKobeyeeParse: a perfect match", () => {
  it("scores every field correct and no wrong fields", () => {
    const parse: KobeyeeParse = {
      tasks: [{ intent: "new_rental", room: "B", purpose: "private_lesson", slots: [slot(ABSOLUTE_11_10, "20:00", "21:00")] }],
    };
    const score = scoreKobeyeeParse(parse, parse);
    expect(score.wrongFieldCount).toBe(0);
    expect(score.taskCount).toBe("correct");
    expect(score.tasks[0]).toMatchObject({
      intent: "correct",
      room: "correct",
      purpose: "correct",
      slotCount: "correct",
      oldSlotCount: "correct",
    });
    expect(score.tasks[0].slots[0]).toEqual({ date: "correct", start: "correct", end: "correct" });
  });
});

describe("scoreKobeyeeParse: null vs wrong", () => {
  const expected: KobeyeeParse = {
    tasks: [{ intent: "new_rental", room: "B", purpose: "private_lesson", slots: [slot(ABSOLUTE_11_10, "20:00", "21:00")] }],
  };

  it("a null room scores missing, not wrong, and doesn't fail the run", () => {
    const actual: KobeyeeParse = {
      tasks: [{ intent: "new_rental", room: null, purpose: "private_lesson", slots: [slot(ABSOLUTE_11_10, "20:00", "21:00")] }],
    };
    const score = scoreKobeyeeParse(expected, actual);
    expect(score.tasks[0].room).toBe("missing");
    expect(score.missingFieldCount).toBe(1);
    expect(score.passed).toBe(true);
  });

  it("a different, non-null room scores wrong", () => {
    const actual: KobeyeeParse = {
      tasks: [{ intent: "new_rental", room: "A", purpose: "private_lesson", slots: [slot(ABSOLUTE_11_10, "20:00", "21:00")] }],
    };
    const score = scoreKobeyeeParse(expected, actual);
    expect(score.tasks[0].room).toBe("wrong");
    expect(score.wrongFieldCount).toBe(1);
  });

  it("a wrong slot date is wrong, even with the same start/end", () => {
    const actual: KobeyeeParse = {
      tasks: [{ intent: "new_rental", room: "B", purpose: "private_lesson", slots: [slot(ABSOLUTE_11_11, "20:00", "21:00")] }],
    };
    const score = scoreKobeyeeParse(expected, actual);
    expect(score.tasks[0].slots[0].date).toBe("wrong");
    expect(score.wrongFieldCount).toBe(1);
  });

  it("purpose is vacuously correct on intents that don't carry one", () => {
    const rescheduleExpected: KobeyeeParse = {
      tasks: [{ intent: "reschedule", room: "B", oldSlots: [slot(ABSOLUTE_11_10, "20:00", "21:00")], slots: [slot(ABSOLUTE_11_11, "20:00", "21:00")] }],
    };
    const score = scoreKobeyeeParse(rescheduleExpected, rescheduleExpected);
    expect(score.tasks[0].purpose).toBe("correct");
    expect(score.wrongFieldCount).toBe(0);
  });
});

describe("scoreKobeyeeParse: task and slot counts", () => {
  it("fewer tasks than expected fails the case", () => {
    const expected: KobeyeeParse = {
      tasks: [
        { intent: "new_rental", room: "A", purpose: null, slots: [slot(ABSOLUTE_11_10, null, null)] },
        { intent: "new_rental", room: "B", purpose: null, slots: [slot(ABSOLUTE_11_11, null, null)] },
      ],
    };
    const actual: KobeyeeParse = { tasks: [expected.tasks[0]] };
    const score = scoreKobeyeeParse(expected, actual);
    expect(score.taskCount).toBe("missing");
    expect(score.passed).toBe(false);
  });

  it("fewer slots than expected fails the case", () => {
    const expected: KobeyeeParse = {
      tasks: [{ intent: "new_rental", room: "A", purpose: null, slots: [slot(ABSOLUTE_11_10, null, null), slot(ABSOLUTE_11_11, null, null)] }],
    };
    const actual: KobeyeeParse = {
      tasks: [{ intent: "new_rental", room: "A", purpose: null, slots: [slot(ABSOLUTE_11_10, null, null)] }],
    };
    const score = scoreKobeyeeParse(expected, actual);
    expect(score.tasks[0].slotCount).toBe("missing");
    expect(score.passed).toBe(false);
  });

  it("more tasks than expected is wrong (a hallucinated extra task)", () => {
    const expected: KobeyeeParse = {
      tasks: [{ intent: "new_rental", room: "A", purpose: null, slots: [slot(ABSOLUTE_11_10, null, null)] }],
    };
    const actual: KobeyeeParse = { tasks: [expected.tasks[0], expected.tasks[0]] };
    const score = scoreKobeyeeParse(expected, actual);
    expect(score.taskCount).toBe("wrong");
    expect(score.wrongFieldCount).toBe(1);
  });

  it("an unreadable result (tasks: []) fails a case that expects tasks", () => {
    const expected: KobeyeeParse = {
      tasks: [{ intent: "new_rental", room: "A", purpose: null, slots: [slot(ABSOLUTE_11_10, "20:00", "21:00")] }],
    };
    const score = scoreKobeyeeParse(expected, { tasks: [] });
    expect(score.taskCount).toBe("missing");
    expect(score.tasks[0].room).toBe("missing");
    expect(score.tasks[0].slots[0].date).toBe("missing");
    expect(score.passed).toBe(false);
  });
});
