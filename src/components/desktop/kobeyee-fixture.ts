// Stands in for the AI route until it exists: every message reads as the
// same fictional request, five legal slots in 小教室.
import type { KobeyeeReader } from "@/components/desktop/kobeyee-session";
import type { SlotDraft } from "@/server/logic/booking";
import { addDays, todayIso } from "@/server/logic/date";
import type { KobeyeeResult } from "@/server/logic/kobeyee";

// Offsets from today so the fixture never reads as past dates.
const FIXTURE_TIMES: Array<[days: number, start: string, end: string]> = [
  [6, "18:30", "20:00"],
  [14, "14:00", "15:30"],
  [16, "16:30", "18:00"],
  [21, "14:00", "15:30"],
  [23, "16:30", "18:00"],
];

function fixtureResult(): KobeyeeResult {
  const today = todayIso();
  const slots: SlotDraft[] = FIXTURE_TIMES.map(([days, start, end]) => ({
    date: addDays(today, days),
    start,
    end,
    isCrossMidnight: false,
  }));
  return {
    status: "ok",
    reviews: [
      {
        intent: "new_rental",
        slots: slots.map((slot) => ({
          state: "legal",
          slot,
          quote: `${slot.date.slice(5).replace("-", "/")} ${slot.start}-${slot.end}`,
          inferred: { year: true },
        })),
        draft: { room: "B", renter: null, slots, purpose: "dance", payment: "transfer" },
        oldBookings: [],
        questions: [{ kind: "renter" }],
      },
    ],
  };
}


const READ_DELAY_MS = 300;

export const fixtureReader: KobeyeeReader = () =>
  new Promise((resolve) => setTimeout(() => resolve(fixtureResult()), READ_DELAY_MS));
