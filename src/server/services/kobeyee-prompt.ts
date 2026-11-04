import { formatDateZh } from "@/server/logic/date";
import type { IsoDate } from "@/server/logic/booking";
import { PURPOSE_CODES, purposeToLabel } from "@/server/supabase/codecs";

const PURPOSE_LIST = PURPOSE_CODES.map((code) => `${code} (${purposeToLabel(code)})`).join(", ");

// Fictional few-shot examples (no real names, no real contact info). Each
// shows one rule from the list below that a staff message tends to break:
// omitted-month inheritance, a trailing time range covering a whole list,
// the full-width colon, and 學員約課 → private_lesson.
const EXAMPLES = `Example 1 — a time range after a date list applies to every date, and "23" inherits October from the date before it:
Message: 「10/21、23晚上8:00-9:00小教室」
→ one new_rental task, room B, two slots (10/21 and 10/23), both 20:00-21:00.

Example 2 — a full-width colon is a colon, and a staff note naming a student is still private_lesson, never a renter name:
Message: 「某學員約課 11/10 下午2：00-3：00 小教室」
→ one new_rental task, room B, purpose private_lesson, one slot (absolute 11/10, 14:00-15:00). The student's name is not extracted anywhere.

Example 3 — a message with no booking content returns no tasks:
Message: 「收到，謝謝老師～」
→ { "tasks": [] }`;

// Pure: the model prompt is a function of the message and "today", nothing
// else, so wording changes can be unit-tested without a network call.
export function buildKobeyeePrompt(text: string, today: IsoDate): string {
  return [
    "You read a staff chat message about studio room rentals and extract it into structured booking tasks.",
    "",
    `Today is ${today} (${formatDateZh(today)}).`,
    "",
    "Rules:",
    "- Every date becomes a DateMention, never a resolved calendar date — a separate resolver runs after you, outside this call.",
    '  - "absolute": the month and day as written; year only if the text states one, otherwise null.',
    '  - "relative_day": an offset in days from today (今天 is 0, 明天 is 1).',
    '  - "weekday": week is "this", "next" (下週) or "after_next" (下下週); a bare 星期X/週X with no 這/下 is "this"; weekday is 1 for Monday through 7 for Sunday.',
    "- A date that does not name one specific day gets no slot: 週末 (including 這週末 and 下週末, which cover two days), 月底, 月初, 找一天, 某天, 改天. Keep the task and its room and purpose, but never pick a day for the sender.",
    "- When a list of dates omits the month on a later date (e.g. 10/21、23), that date inherits the month of the date written before it.",
    "- A time range written after a list of dates applies to every date in that list, not only the last one.",
    "- A full-width colon (：) is a colon, the same as a half-width one.",
    "- A time written with a colon or dot (10:00-12:00, 19.30) is a 24-hour clock time; take it as written.",
    '- Only a bare 點 hour range with no 早/午/晚/上午/下午/中午 (e.g. 「8-9點」) has unclear AM/PM; leave start and end null for that case only.',
    '- 大教室 is room "A", 小教室 is room "B". Leave room null when the message doesn\'t say which.',
    `- purpose is one of: ${PURPOSE_LIST}. 學員約課 and 私課 both mean private_lesson.`,
    "- Never extract a renter's name, a teacher's name, a payment method, or an amount, even when the text states one.",
    "- A task has exactly one room. A message covering both rooms becomes two tasks, one per room.",
    "- reschedule: oldSlots are the existing booking(s) being moved, slots are the new time(s) being moved to.",
    '- Text with nothing booking-related (greetings, small talk, unrelated chat) returns { "tasks": [] }.',
    "- cancellation: oldSlots are the existing booking(s) the sender wants to cancel (取消, 不用了). It is never a reschedule with empty new slots.",
    "- quote is the exact source span (a line or clause) a slot came from, for staff to cross-check — not something shown back to the renter.",
    "",
    EXAMPLES,
    "",
    "Message:",
    text,
  ].join("\n");
}
