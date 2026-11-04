import type { KobeyeeParse, KobeyeeTask, ParsedSlot } from "@/server/logic/kobeyee-parse";

// quote is evidence text and may differ between two copies of the same slot.
function slotKey(slot: ParsedSlot): string {
  return JSON.stringify([slot.date, slot.start, slot.end]);
}

function uniqueSlots(slots: readonly ParsedSlot[]): ParsedSlot[] {
  const seen = new Set<string>();
  return slots.filter((slot) => {
    const key = slotKey(slot);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function withUniqueSlots(task: KobeyeeTask): KobeyeeTask {
  switch (task.intent) {
    case "new_rental":
    case "availability_question":
      return { ...task, slots: uniqueSlots(task.slots) };
    case "reschedule":
      return { ...task, oldSlots: uniqueSlots(task.oldSlots), slots: uniqueSlots(task.slots) };
    case "cancellation":
      return { ...task, oldSlots: uniqueSlots(task.oldSlots) };
  }
}

function taskKey(task: KobeyeeTask): string {
  const { intent, room } = task;
  const slots = "slots" in task ? task.slots.map(slotKey) : [];
  const oldSlots = "oldSlots" in task ? task.oldSlots.map(slotKey) : [];
  const purpose = task.intent === "new_rental" ? task.purpose : null;
  return JSON.stringify([intent, room, purpose, oldSlots, slots]);
}

// The model sometimes emits the same task or slot twice (seen live on a
// multi-line reschedule). A repeat never means a second booking, so drop it
// before staff see two copies of one request.
export function dedupeKobeyeeParse(parse: KobeyeeParse): KobeyeeParse {
  const seen = new Set<string>();
  const tasks = parse.tasks.map(withUniqueSlots).filter((task) => {
    const key = taskKey(task);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { tasks };
}
