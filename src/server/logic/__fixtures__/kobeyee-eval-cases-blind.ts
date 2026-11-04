import type { IsoDate } from "@/server/logic/booking";
import type { KobeyeeEvalCase } from "@/server/logic/__fixtures__/kobeyee-eval-cases";
import type { DateMention, KobeyeeTask, ParsedSlot, Room } from "@/server/logic/kobeyee-parse";
import type { PurposeCode } from "@/server/supabase/codecs";

function absolute(month: number, day: number, year: number | null = null): DateMention {
  return { kind: "absolute", month, day, year };
}

function relativeDay(offset: number): DateMention {
  return { kind: "relative_day", offset };
}

function weekday(week: "this" | "next" | "after_next", day: number): DateMention {
  return { kind: "weekday", week, weekday: day };
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

const TODAY: IsoDate = "2026-11-04";

export const kobeyeeBlindEvalCases: KobeyeeEvalCase[] = [
  {
    id: "typo-emoji-private-lesson",
    description: "錯字、emoji 與私課用途",
    input: "想租借大教室～11/18 晚上七點到八點，老師要上私刻🙏",
    today: TODAY,
    expected: { tasks: [newRental("A", "private_lesson", [slot(absolute(11, 18), "19:00", "20:00")])] },
  },
  {
    id: "two-rooms-separate-lines",
    description: "同一訊息的兩個房間拆成兩個 task",
    input: "麻煩幫排\n大教室 11/20 18:30-20:00 舞蹈\n小教室 11/21 09:00-10:00 瑜珈，謝謝",
    today: TODAY,
    expected: {
      tasks: [
        newRental("A", "dance", [slot(absolute(11, 20), "18:30", "20:00")]),
        newRental("B", "yoga", [slot(absolute(11, 21), "09:00", "10:00")]),
      ],
    },
  },
  {
    id: "reschedule-multiline-old-new",
    description: "多行改期，清楚區分原時段與新時段",
    input: "小教室那堂要改一下\n原本11/9 14:00-15:30\n移到11/16 16:00-17:30",
    today: TODAY,
    expected: {
      tasks: [
        reschedule(
          "B",
          [slot(absolute(11, 9), "14:00", "15:30")],
          [slot(absolute(11, 16), "16:00", "17:30")],
        ),
      ],
    },
  },
  {
    id: "availability-question-polite",
    description: "禮貌詢問指定時段是否有空",
    input: "請問下週二晚上 6:30～8:00 大教室還有空嗎？",
    today: TODAY,
    expected: { tasks: [availability("A", [slot(weekday("next", 2), "18:30", "20:00")])] },
  },
  {
    id: "cancellation-only",
    description: "純取消訊息是 cancellation，列出要取消的舊預約",
    input: "不好意思，11/12 小教室那堂先取消喔，暫時不用另排🙇",
    today: TODAY,
    expected: {
      tasks: [{ intent: "cancellation", room: "B", oldSlots: [slot(absolute(11, 12), null, null)] }],
    },
  },
  // DISPUTED: 「早上」有時可套用營業時段，但訊息沒有可忠實抽取的起訖時間。
  {
    id: "vague-morning-no-clock",
    description: "只有模糊早上，時間應留 null",
    input: "11月23日早上想租小教室拍攝，時間再跟老師確認",
    today: TODAY,
    expected: { tasks: [newRental("B", "photography", [slot(absolute(11, 23), null, null)])] },
  },
  // DISPUTED: 「兩小時」是長度而非起訖時間，仍保留有日期的租借需求。
  {
    id: "headcount-duration-not-times",
    description: "學員數與時數不可誤判為鐘點",
    input: "11/25 大教室，8位學員上作品班，大概2小時，幾點晚點補",
    today: TODAY,
    expected: { tasks: [newRental("A", "workshop", [slot(absolute(11, 25), null, null)])] },
  },
  {
    id: "day-after-tomorrow-colloquial",
    description: "口語後天與展演用途",
    input: "後天 13:00 到 15:00 要用大教室做展演彩排～",
    today: TODAY,
    expected: { tasks: [newRental("A", "performance", [slot(relativeDay(2), "13:00", "15:00")])] },
  },
  {
    id: "this-sunday-aerobics",
    description: "本週日與有氧用途",
    input: "這禮拜天小教室 10:00-11:00 有氧課，幫我登記一下",
    today: TODAY,
    expected: { tasks: [newRental("B", "aerobics", [slot(weekday("this", 7), "10:00", "11:00")])] },
  },
  {
    id: "teacher-students-not-renter",
    description: "老師與學員措辭不應被當成需抽取的人名欄位",
    input: "老師帶3位學員，明天 15:20-16:50，小教室上舞蹈",
    today: TODAY,
    expected: { tasks: [newRental("B", "dance", [slot(relativeDay(1), "15:20", "16:50")])] },
  },
  {
    id: "explicit-year-leap-day",
    description: "明確年份的閏日與 24 小時制時間",
    input: "預約 2028/2/29 09:15-10:45 大教室，其餘拍攝",
    today: TODAY,
    expected: { tasks: [newRental("A", "photography", [slot(absolute(2, 29, 2028), "09:15", "10:45")])] },
  },
  {
    id: "inclusive-date-range-daily",
    description: "連續日期範圍展開成每日時段",
    input: "11/27～11/29 每天晚上7-8點，小教室瑜珈",
    today: TODAY,
    expected: {
      tasks: [
        newRental("B", "yoga", [
          slot(absolute(11, 27), "19:00", "20:00"),
          slot(absolute(11, 28), "19:00", "20:00"),
          slot(absolute(11, 29), "19:00", "20:00"),
        ]),
      ],
    },
  },
  {
    id: "mixed-new-and-availability",
    description: "同訊息混合確定租借與另一房間空檔詢問",
    input: "大教室 12/2 17:00-18:00 確定租舞蹈；另外小教室12/3同時段有空嗎？",
    today: TODAY,
    expected: {
      tasks: [
        newRental("A", "dance", [slot(absolute(12, 2), "17:00", "18:00")]),
        availability("B", [slot(absolute(12, 3), "17:00", "18:00")]),
      ],
    },
  },
  {
    id: "weekend-unrepresentable-date",
    description: "週末是多日模糊日期，不應猜星期六或星期日",
    input: "想問這週末大教室下午兩點到四點能不能租？",
    today: TODAY,
    expected: { tasks: [availability("A", [])] },
  },
  {
    id: "week-after-next-unrepresentable",
    description: "下下週三 is weekday after_next",
    input: "下下週三 19:00-20:30 小教室想上私課",
    today: TODAY,
    expected: { tasks: [newRental("B", "private_lesson", [slot(weekday("after_next", 3), "19:00", "20:30")])] },
  },
  {
    id: "month-end-unrepresentable",
    description: "月底不應被擅自具體化",
    input: "月底找一天晚上用大教室做作品班，約兩小時",
    today: TODAY,
    expected: { tasks: [newRental("A", "workshop", [])] },
  },
  // DISPUTED: 「8-9點」缺少上午或晚上線索，依契約將起訖均留 null。
  {
    id: "ambiguous-am-pm",
    description: "缺少 AM/PM 的鐘點不可猜測",
    input: "11/30 大教室 8-9點 舞蹈，感謝",
    today: TODAY,
    expected: { tasks: [newRental("A", "dance", [slot(absolute(11, 30), null, null)])] },
  },
  {
    id: "non-booking-operational-chat",
    description: "只有教室整理與人數資訊的營運文字",
    input: "小教室椅子剩6張，老師說下課後會把音響關掉👌",
    today: TODAY,
    expected: { tasks: [] },
  },
];
