import { describe, expect, it } from "vitest";
import { dedupeKobeyeeParse } from "@/server/logic/kobeyee-parse-dedupe";
import type { KobeyeeTask, ParsedSlot } from "@/server/logic/kobeyee-parse";

function slot(day: number, quote = ""): ParsedSlot {
  return { date: { kind: "absolute", month: 11, day, year: null }, start: "16:00", end: "17:30", quote };
}

const reschedule: KobeyeeTask = { intent: "reschedule", room: "B", oldSlots: [slot(9)], slots: [slot(16)] };

describe("dedupeKobeyeeParse", () => {
  it("keeps one copy of a task the model repeated", () => {
    expect(dedupeKobeyeeParse({ tasks: [reschedule, reschedule] })).toEqual({ tasks: [reschedule] });
  });

  it("treats copies that differ only in quote as the same task", () => {
    const copy: KobeyeeTask = { ...reschedule, slots: [slot(16, "移到11/16")] };
    expect(dedupeKobeyeeParse({ tasks: [reschedule, copy] }).tasks).toHaveLength(1);
  });

  it("drops a repeated slot inside one task", () => {
    const task: KobeyeeTask = { intent: "new_rental", room: "A", purpose: null, slots: [slot(9), slot(9), slot(10)] };
    expect(dedupeKobeyeeParse({ tasks: [task] }).tasks[0]).toEqual({ ...task, slots: [slot(9), slot(10)] });
  });

  it("keeps tasks that differ in room", () => {
    const other: KobeyeeTask = { ...reschedule, room: "A" };
    expect(dedupeKobeyeeParse({ tasks: [reschedule, other] }).tasks).toHaveLength(2);
  });
});
