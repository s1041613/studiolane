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

function reschedule(room: Room | null, oldSlots: ParsedSlot[], slots: ParsedSlot[]): KobeyeeTask {
  return { intent: "reschedule", room, oldSlots, slots };
}

function availability(room: Room | null, slots: ParsedSlot[]): KobeyeeTask {
  return { intent: "availability_question", room, slots };
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
  // Messier phrasings that none of the prompt's examples mirror.
  {
    id: "messy-availability-then-book",
    description: "asks if free and offers to book; still availability_question",
    input: "哈囉～想問下週二晚上7點到9點小教室還有空嗎？可以的話想直接預約🙏",
    today: TODAY,
    expected: { tasks: [availability("B", [slot(weekday("next", 2), "19:00", "21:00")])] },
  },
  {
    id: "messy-performance-purpose",
    description: "成果展 maps to performance",
    input: "這週六下午2點-5點我想借大教室排成果展～",
    today: TODAY,
    expected: { tasks: [newRental("A", "performance", [slot(weekday("this", 6), "14:00", "17:00")])] },
  },
  {
    id: "messy-dotted-time",
    description: "19.30 written with a dot",
    input: "11/20 19.30-21.00 小教室 麻煩了",
    today: TODAY,
    expected: { tasks: [newRental("B", null, [slot(absolute(11, 20), "19:30", "21:00")])] },
  },
  {
    id: "messy-half-hour-tilde",
    description: "點半 and a tilde separator",
    input: "11/21 晚上7點半～9點 大教室",
    today: TODAY,
    expected: { tasks: [newRental("A", null, [slot(absolute(11, 21), "19:30", "21:00")])] },
  },
  {
    id: "messy-weekday-annotations",
    description: "dates annotated with (二)/(四), room at the end",
    input: "11/24(二) 18:00-20:00\n11/26(四) 18:00-20:00\n以上小教室 謝謝",
    today: TODAY,
    expected: {
      tasks: [
        newRental("B", null, [slot(absolute(11, 24), "18:00", "20:00"), slot(absolute(11, 26), "18:00", "20:00")]),
      ],
    },
  },
  {
    id: "messy-date-range-every-day",
    description: "12/1到12/3每天 expands to three slots",
    input: "12/1到12/3 每天 10:00-12:00 大教室",
    today: TODAY,
    expected: {
      tasks: [
        newRental("A", null, [
          slot(absolute(12, 1), "10:00", "12:00"),
          slot(absolute(12, 2), "10:00", "12:00"),
          slot(absolute(12, 3), "10:00", "12:00"),
        ]),
      ],
    },
  },
  {
    id: "messy-chinese-month-day",
    description: "11月25號 and 三點到五點 in words",
    input: "11月25號 下午三點到五點 小教室",
    today: TODAY,
    expected: { tasks: [newRental("B", null, [slot(absolute(11, 25), "15:00", "17:00")])] },
  },
  {
    id: "messy-no-room",
    description: "room not stated stays null",
    input: "11/27 19:00-21:00 想租借教室",
    today: TODAY,
    expected: { tasks: [newRental(null, null, [slot(absolute(11, 27), "19:00", "21:00")])] },
  },
  {
    id: "messy-day-after-tomorrow",
    description: "後天 is offset 2",
    input: "後天早上10點到12點 小教室可以嗎 我要租",
    today: TODAY,
    expected: { tasks: [newRental("B", null, [slot(relativeDay(2), "10:00", "12:00")])] },
  },
  {
    id: "messy-reschedule-same-time",
    description: "同時段 copies the old time to the new date",
    input: "原本11/12 14:00-16:00 想改到11/19同時段",
    today: TODAY,
    expected: {
      tasks: [reschedule(null, [slot(absolute(11, 12), "14:00", "16:00")], [slot(absolute(11, 19), "14:00", "16:00")])],
    },
  },
  {
    id: "messy-noon",
    description: "中午12點到1點 is 12:00-13:00",
    input: "11/28 中午12點到1點 小教室",
    today: TODAY,
    expected: { tasks: [newRental("B", null, [slot(absolute(11, 28), "12:00", "13:00")])] },
  },
  {
    id: "messy-payment-note-is-not-booking",
    description: "a transfer note full of digits returns no tasks",
    input: "好的 已匯款 末五碼 48213 謝謝",
    today: TODAY,
    expected: { tasks: [] },
  },
  {
    id: "messy-year-boundary",
    description: "late December, 1/3 without a year stays year null",
    input: "1/3 10:00-12:00 大教室",
    today: "2026-12-28",
    expected: { tasks: [newRental("A", null, [slot(absolute(1, 3), "10:00", "12:00")])] },
  },
  {
    id: "messy-spaced-slashes",
    description: "spaces inside the date and around the dash",
    input: "11 / 30  19:00 - 21:00 小教室",
    today: TODAY,
    expected: { tasks: [newRental("B", null, [slot(absolute(11, 30), "19:00", "21:00")])] },
  },
];
