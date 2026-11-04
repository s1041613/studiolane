import type { KobeyeeParse, KobeyeeTask, ParsedSlot } from "@/server/logic/kobeyee-parse";

// How one field compares to what a fixture expects. "missing" (the model
// said null, or omitted a slot/task entirely) scores better than "wrong" (a
// concrete, different value) — a guess that's wrong is worse than staff
// being asked to fill in a blank. A "wrong" field fails the case, and so
// does a dropped task or slot: losing a whole slot means a booking silently
// goes unregistered. A null field is only counted, so it shows up in the
// report instead of passing unseen.
export type FieldVerdict = "correct" | "missing" | "wrong";

export type SlotScore = { date: FieldVerdict; start: FieldVerdict; end: FieldVerdict };

export type TaskScore = {
  intent: FieldVerdict;
  room: FieldVerdict;
  // "correct" (vacuously) on reschedule/availability_question, which carry no purpose.
  purpose: FieldVerdict;
  slotCount: FieldVerdict;
  slots: SlotScore[]; // one per expected slot, paired with the actual slot at the same index
  oldSlotCount: FieldVerdict;
  oldSlots: SlotScore[];
};

export type CaseScore = {
  taskCount: FieldVerdict;
  tasks: TaskScore[]; // one per expected task, paired with the actual task at the same index
  wrongFieldCount: number;
  // Null fields where the fixture has a value. Not a failure, but reported.
  missingFieldCount: number;
  passed: boolean;
};

// Scoped to the plain JSON-shaped fields this module compares (numbers,
// strings, null, and flat objects like DateMention) — not a general-purpose
// deep-equal. Key order never matters here because every object compared
// through this has a fixed, known set of keys.
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  const aEntries = Object.entries(a as Record<string, unknown>);
  const bRecord = b as Record<string, unknown>;
  if (aEntries.length !== Object.keys(bRecord).length) return false;
  return aEntries.every(([key, value]) => deepEqual(value, bRecord[key]));
}

function fieldVerdict(expected: unknown, actual: unknown): FieldVerdict {
  if (deepEqual(expected, actual)) return "correct";
  return actual === null || actual === undefined ? "missing" : "wrong";
}

// expectedLen 0 with actualLen 0 is "correct"; fewer than expected is a
// "missing" extraction, more than expected is a hallucinated extra (not
// asked for, so it's treated the same as a wrong value).
function countVerdict(expectedLen: number, actualLen: number): FieldVerdict {
  if (expectedLen === actualLen) return "correct";
  return actualLen < expectedLen ? "missing" : "wrong";
}

function scoreSlots(expected: readonly ParsedSlot[], actual: readonly ParsedSlot[]): SlotScore[] {
  return expected.map((slot, i) => {
    const actualSlot: ParsedSlot | undefined = actual[i];
    return {
      date: fieldVerdict(slot.date, actualSlot?.date),
      start: fieldVerdict(slot.start, actualSlot?.start),
      end: fieldVerdict(slot.end, actualSlot?.end),
    };
  });
}

function oldSlotsOf(task: KobeyeeTask | undefined): readonly ParsedSlot[] {
  return task?.intent === "reschedule" ? task.oldSlots : [];
}

function purposeOf(task: KobeyeeTask | undefined): string | null | undefined {
  return task?.intent === "new_rental" ? task.purpose : undefined;
}

function scoreTask(expected: KobeyeeTask, actual: KobeyeeTask | undefined): TaskScore {
  const expectedOldSlots = oldSlotsOf(expected);
  const actualOldSlots = oldSlotsOf(actual);
  return {
    intent: fieldVerdict(expected.intent, actual?.intent),
    room: fieldVerdict(expected.room, actual?.room),
    purpose: expected.intent === "new_rental" ? fieldVerdict(expected.purpose, purposeOf(actual)) : "correct",
    slotCount: countVerdict(expected.slots.length, actual?.slots.length ?? 0),
    slots: scoreSlots(expected.slots, actual?.slots ?? []),
    oldSlotCount: countVerdict(expectedOldSlots.length, actualOldSlots.length),
    oldSlots: scoreSlots(expectedOldSlots, actualOldSlots),
  };
}

function isWrong(verdict: FieldVerdict): boolean {
  return verdict === "wrong";
}

function isMissing(verdict: FieldVerdict): boolean {
  return verdict === "missing";
}

function countMissingInTask(task: TaskScore): number {
  const slotMissing = (s: SlotScore) => [s.date, s.start, s.end].filter(isMissing).length;
  return (
    [task.intent, task.room, task.purpose].filter(isMissing).length +
    task.slots.reduce((sum, s) => sum + slotMissing(s), 0) +
    task.oldSlots.reduce((sum, s) => sum + slotMissing(s), 0)
  );
}

function dropsTaskOrSlot(taskCount: FieldVerdict, tasks: readonly TaskScore[]): boolean {
  return taskCount === "missing" || tasks.some((t) => t.slotCount === "missing" || t.oldSlotCount === "missing");
}

function countWrongInTask(task: TaskScore): number {
  const slotWrong = (s: SlotScore) => [s.date, s.start, s.end].filter(isWrong).length;
  return (
    [task.intent, task.room, task.purpose, task.slotCount, task.oldSlotCount].filter(isWrong).length +
    task.slots.reduce((sum, s) => sum + slotWrong(s), 0) +
    task.oldSlots.reduce((sum, s) => sum + slotWrong(s), 0)
  );
}

// Compares two KobeyeeParse values field by field (quote is never scored —
// it's evidence for staff, not a value the model needs to get "right").
// `expected` is the fixture; `actual` is the real parse, or `{ tasks: [] }`
// when extraction came back unreadable (see scripts/eval-kobeyee.ts).
export function scoreKobeyeeParse(expected: KobeyeeParse, actual: KobeyeeParse): CaseScore {
  const taskCount = countVerdict(expected.tasks.length, actual.tasks.length);
  const tasks = expected.tasks.map((task, i) => scoreTask(task, actual.tasks[i]));
  const wrongFieldCount = (taskCount === "wrong" ? 1 : 0) + tasks.reduce((sum, t) => sum + countWrongInTask(t), 0);
  const missingFieldCount = tasks.reduce((sum, t) => sum + countMissingInTask(t), 0);
  const passed = wrongFieldCount === 0 && !dropsTaskOrSlot(taskCount, tasks);
  return { taskCount, tasks, wrongFieldCount, missingFieldCount, passed };
}
