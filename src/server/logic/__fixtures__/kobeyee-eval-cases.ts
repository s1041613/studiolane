import type { DateMention, KobeyeeParse, KobeyeeTask, ParsedSlot, Room } from "@/server/logic/kobeyee-parse";
import type { IsoDate } from "@/server/logic/booking";
import type { PurposeCode } from "@/server/supabase/codecs";

// Fictional eval fixtures for pnpm eval:ai (src/server/logic/kobeyee-eval-scorer.ts
// scores each case; scripts/eval-kobeyee.ts runs them against the real
// model). No real names, no real contact info, no real prices — see AGENTS.md.

export type KobeyeeEvalCase = {
  id: string;
  description: string;
  input: string;
  today: IsoDate;
  expected: KobeyeeParse;
};

function absolute(month: number, day: number, year: number | null = null): DateMention {
  return { kind: "absolute", month, day, year };
}

function weekday(week: "this" | "next", weekday: number): DateMention {
  return { kind: "weekday", week, weekday };
}

function relativeDay(offset: number): DateMention {
  return { kind: "relative_day", offset };
}

function slot(date: DateMention, start: string | null, end: string | null, quote = ""): ParsedSlot {
  return { date, start, end, quote };
}

function newRental(room: Room | null, purpose: PurposeCode | null, slots: ParsedSlot[]): KobeyeeTask {
  return { intent: "new_rental", room, purpose, slots };
}

const TODAY: IsoDate = "2026-11-04"; // a Wednesday

export const kobeyeeEvalCases: KobeyeeEvalCase[] = [
  {
    id: "relative-day-fullwidth-colon",
    description: "明天 + full-width colon",
    input: "明天晚上8：00-9：00 小教室",
    today: TODAY,
    expected: { tasks: [newRental("B", null, [slot(relativeDay(1), "20:00", "21:00")])] },
  },
  {
    id: "five-slots-one-per-line",
    description: "小教室, five slots one per line",
    input: "小教室\n11/10 20:00-21:00\n11/11 20:00-21:00\n11/12 20:00-21:00\n11/13 20:00-21:00\n11/14 20:00-21:00",
    today: TODAY,
    expected: {
      tasks: [
        newRental("B", null, [
          slot(absolute(11, 10), "20:00", "21:00"),
          slot(absolute(11, 11), "20:00", "21:00"),
          slot(absolute(11, 12), "20:00", "21:00"),
          slot(absolute(11, 13), "20:00", "21:00"),
          slot(absolute(11, 14), "20:00", "21:00"),
        ]),
      ],
    },
  },
  {
    id: "six-slots-one-per-line",
    description: "大教室, six slots one per line",
    input: "大教室\n12/1 19:00-20:00\n12/2 19:00-20:00\n12/3 19:00-20:00\n12/4 19:00-20:00\n12/5 19:00-20:00\n12/6 19:00-20:00",
    today: TODAY,
    expected: {
      tasks: [
        newRental("A", null, [
          slot(absolute(12, 1), "19:00", "20:00"),
          slot(absolute(12, 2), "19:00", "20:00"),
          slot(absolute(12, 3), "19:00", "20:00"),
          slot(absolute(12, 4), "19:00", "20:00"),
          slot(absolute(12, 5), "19:00", "20:00"),
          slot(absolute(12, 6), "19:00", "20:00"),
        ]),
      ],
    },
  },
  {
    id: "reschedule-omitted-month-and-trailing-time",
    description: "reschedule; omitted month on the second old date; one trailing time range for both new dates",
    input: "小教室 10/21、23 改成 10/27、11/3 16:00-17:30",
    today: TODAY,
    expected: {
      tasks: [
        {
          intent: "reschedule",
          room: "B",
          oldSlots: [slot(absolute(10, 21), null, null), slot(absolute(10, 23), null, null)],
          slots: [slot(absolute(10, 27), "16:00", "17:30"), slot(absolute(11, 3), "16:00", "17:30")],
        },
      ],
    },
  },
  {
    id: "staff-typed-student-name-is-private-lesson",
    description: "staff-typed message naming a student; private_lesson; the name is never extracted",
    input: "佳佳約課 11/20 10:00-11:00 小教室",
    today: TODAY,
    expected: { tasks: [newRental("B", "private_lesson", [slot(absolute(11, 20), "10:00", "11:00")])] },
  },
  {
    id: "availability-question",
    description: "availability_question, not new_rental",
    input: "10/9 13:00-14:30 小教室可以租借嗎",
    today: TODAY,
    expected: { tasks: [{ intent: "availability_question", room: "B", slots: [slot(absolute(10, 9), "13:00", "14:30")] }] },
  },
  {
    id: "this-week-weekday-with-explicit-evening",
    description: "這週四 + 晚上 (explicit evening, not the unclear-AM/PM case)",
    input: "這週四晚上8-9點",
    today: TODAY,
    expected: { tasks: [newRental(null, null, [slot(weekday("this", 4), "20:00", "21:00")])] },
  },
  {
    id: "unclear-am-pm",
    description: "a bare hour range with no 早/午/晚 leaves start and end null",
    input: "小教室 11/15 8-9點",
    today: TODAY,
    expected: { tasks: [newRental("B", null, [slot(absolute(11, 15), null, null)])] },
  },
  {
    id: "both-rooms-become-two-tasks",
    description: "a message covering both rooms splits into two tasks",
    input: "大教室跟小教室都要租 11/16 19:00-20:00",
    today: TODAY,
    expected: {
      tasks: [
        newRental("A", null, [slot(absolute(11, 16), "19:00", "20:00")]),
        newRental("B", null, [slot(absolute(11, 16), "19:00", "20:00")]),
      ],
    },
  },
  {
    id: "mixed-new-rental-and-reschedule",
    description: "one message, two tasks: a new booking and an unrelated reschedule",
    input: "大教室 11/18 19:00-20:00 新增一筆，另外小教室原本10/5的要改到10/12 19:00-20:00",
    today: TODAY,
    expected: {
      tasks: [
        newRental("A", null, [slot(absolute(11, 18), "19:00", "20:00")]),
        {
          intent: "reschedule",
          room: "B",
          oldSlots: [slot(absolute(10, 5), null, null)],
          slots: [slot(absolute(10, 12), "19:00", "20:00")],
        },
      ],
    },
  },
  {
    id: "pure-greeting-is-not-booking-related",
    description: "a greeting with no booking content returns no tasks",
    input: "早安，今天天氣真好",
    today: TODAY,
    expected: { tasks: [] },
  },
  {
    id: "explicit-year",
    description: "a fully written year is kept, not treated as omitted",
    input: "2027/1/6 小教室 19:00-20:00",
    today: TODAY,
    expected: { tasks: [newRental("B", null, [slot(absolute(1, 6, 2027), "19:00", "20:00")])] },
  },
];
