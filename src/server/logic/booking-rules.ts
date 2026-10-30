import { RentalStatus } from "@/server/types/home";
import type { RentalSummary } from "@/server/types/home";
import { addDays, isoWeekday, shortDateParts, todayIso } from "@/server/logic/date";
import type { CheckResult, HHmm, IsoDate, SlotDraft, TimeWindow } from "@/server/logic/booking";
import { intervalsOverlap, toStartsEndsAt } from "@/server/supabase/codecs";

// One row of rental_rules, shown as one line on a settings screen. A "block"
// row marks time that is NOT rentable; getAvailableWindows computes the
// complement. An "open" row only exists for one date and lifts that date's
// weekly blocks. Rules apply to every purpose.
export type RuleEffect = "block" | "open";

// docs/rental-time-rules: 上課時段 (class_hours, managed on the class schedule page)
// is where classes may go and is never rented out; 租借規則 (rental, the rules
// page) only shapes renting and never affects the class schedule.
export type RuleKind = "class_hours" | "rental";

export type RentalRule = {
  id: string;
  kind: RuleKind;
  room: "A" | "B" | null; // null = applies to both rooms
  weekday: number; // 1 = Monday ... 7 = Sunday
  onDate: IsoDate | null; // null = every week; set = that one date only
  start: HHmm;
  end: HHmm; // "24:00" means through the end of the day
  effect: RuleEffect;
  reason: string;
  archivedAt: string | null;
};

// What a settings write supplies; id and archive state belong to the DB row.
export type RuleInput = Omit<RentalRule, "id" | "archivedAt">;

export type RuleContext = {
  rules: RentalRule[];
  // D4: only RentalStatus.Registered rentals occupy a slot (hard block);
  // pending/awaiting-payment/postponed never do. Caller may pass the full
  // list, this module filters again defensively.
  existingRentals: RentalSummary[];
};

export function toMinutes(hhmm: HHmm): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// 00:00–23:59, plus 24:00 as the end of a day.
const HHMM_PATTERN = /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/;

export function isValidHHmm(value: string): boolean {
  return HHMM_PATTERN.test(value);
}

function ruleApplies(rule: RentalRule, room: "A" | "B", date: IsoDate): boolean {
  if (rule.archivedAt !== null) return false;
  if (rule.room !== null && rule.room !== room) return false;
  return rule.onDate === null ? rule.weekday === isoWeekday(date) : rule.onDate === date;
}

// A blocked stretch of one day, with the rule row that blocks it.
export type RuleBlock = { start: HHmm; end: HHmm; reason: string; ruleId: string };

export type MinuteRange = [number, number];

export function subtractRanges(range: MinuteRange, cuts: readonly MinuteRange[]): MinuteRange[] {
  return cuts.reduce<MinuteRange[]>(
    (pieces, [cutStart, cutEnd]) =>
      pieces.flatMap(([start, end]): MinuteRange[] => {
        if (cutEnd <= start || end <= cutStart) return [[start, end]];
        return [
          ...(start < cutStart ? [[start, cutStart] as MinuteRange] : []),
          ...(cutEnd < end ? [[cutEnd, end] as MinuteRange] : []),
        ];
      }),
    [range],
  );
}

// B1: what the rules block on this room and date —
// (weekly blocks − that date's opens) + that date's blocks.
// Archived rows don't count; a one-day block always wins over an open.
export function ruleBlocksForDay(room: "A" | "B", date: IsoDate, rules: readonly RentalRule[]): RuleBlock[] {
  const applying = rules.filter((r) => ruleApplies(r, room, date));
  const opens: MinuteRange[] = applying
    .filter((r) => r.effect === "open")
    .map((r) => [toMinutes(r.start), toMinutes(r.end)]);

  const toBlocks = (rule: RentalRule, ranges: MinuteRange[]): RuleBlock[] =>
    ranges.map(([start, end]) => ({ start: minutesToHHmm(start), end: minutesToHHmm(end), reason: rule.reason, ruleId: rule.id }));

  const weekly = applying
    .filter((r) => r.effect === "block" && r.onDate === null)
    .flatMap((r) => toBlocks(r, subtractRanges([toMinutes(r.start), toMinutes(r.end)], opens)));
  const oneDay = applying
    .filter((r) => r.effect === "block" && r.onDate !== null)
    .flatMap((r) => toBlocks(r, [[toMinutes(r.start), toMinutes(r.end)]]));

  return [...oneDay, ...weekly];
}

// D3: registered rentals that overlap this calendar day's [00:00, 24:00)
// window, converted from their real startsAt/endsAt instant to minutes
// since that day's midnight. A rental starting the previous night (e.g.
// 22:30) and spilling into this day (00:00-00:30) is included here too —
// comparing by `r.date === date` alone would miss that spillover entirely,
// since the rental's `date` is the previous day's.
function registeredRentalRangesForDay(
  room: "A" | "B",
  date: IsoDate,
  existingRentals: RentalSummary[],
): Array<[number, number]> {
  const dayStart = toStartsEndsAt(date, "00:00", "00:00", false).startsAt;
  const dayEnd = toStartsEndsAt(date, "00:00", "00:00", true).endsAt; // next day's 00:00
  const dayWindow = { startsAt: dayStart, endsAt: dayEnd };

  return existingRentals
    .filter((r) => r.status === RentalStatus.Registered && r.room === room)
    .filter((r) =>
      intervalsOverlap(dayWindow, { startsAt: new Date(r.startsAt), endsAt: new Date(r.endsAt) }),
    )
    .map((r) => {
      const startsAt = new Date(r.startsAt);
      const endsAt = new Date(r.endsAt);
      const startMinutesIntoDay = Math.max(0, Math.round((startsAt.getTime() - dayStart.getTime()) / 60000));
      const endMinutesIntoDay = Math.min(1440, Math.round((endsAt.getTime() - dayStart.getTime()) / 60000));
      return [startMinutesIntoDay, endMinutesIntoDay] as [number, number];
    });
}

// Blocked minute-ranges (within a single day, 0..1440) for a given
// room/date, from 〈租借規則〉 rows and from already-registered rentals
// overlapping that date.
function blockedRanges(room: "A" | "B", date: IsoDate, ctx: RuleContext): Array<[number, number]> {
  const fromRules: Array<[number, number]> = ruleBlocksForDay(room, date, ctx.rules).map((b) => [
    toMinutes(b.start),
    toMinutes(b.end),
  ]);

  const fromRentals = registeredRentalRangesForDay(room, date, ctx.existingRentals);

  return [...fromRules, ...fromRentals];
}

export function mergeRanges(ranges: Array<[number, number]>): Array<[number, number]> {
  if (!ranges.length) return [];
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [sorted[0]];
  for (const [start, end] of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    if (start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}

export function minutesToHHmm(min: number): HHmm {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Available windows = complement of the merged blocked ranges within 0..1440
// for that single calendar day. Cross-midnight callers combine this day's
// tail with the next day's head themselves (see checkBooking).
export function getAvailableWindows(room: "A" | "B", date: IsoDate, ctx: RuleContext): TimeWindow[] {
  const blocked = mergeRanges(blockedRanges(room, date, ctx));
  const windows: TimeWindow[] = [];
  let cursor = 0;
  for (const [start, end] of blocked) {
    if (start > cursor) windows.push({ start: minutesToHHmm(cursor), end: minutesToHHmm(start) });
    cursor = Math.max(cursor, end);
  }
  if (cursor < 1440) windows.push({ start: minutesToHHmm(cursor), end: minutesToHHmm(1440) });
  return windows;
}

// F-時間-9: on today's date, drop the time that has already passed — windows
// start at the next half hour from now (Asia/Taipei). Other dates are
// returned unchanged.
export function clipWindowsToNow(windows: TimeWindow[], date: IsoDate, now: Date): TimeWindow[] {
  if (date !== todayIso(now)) return windows;
  const dayStart = toStartsEndsAt(date, "00:00", "00:00", false).startsAt;
  const minutesNow = (now.getTime() - dayStart.getTime()) / 60000;
  const earliest = Math.ceil(minutesNow / 30) * 30;
  return windows
    .filter((w) => toMinutes(w.end) > earliest)
    .map((w) => (toMinutes(w.start) >= earliest ? w : { start: minutesToHHmm(earliest), end: w.end }));
}

// F-日期-2/F-日期-3: a date is greyed out when it's in the past, or when
// neither room has any window left that day, so the result doesn't depend on
// the form's current room.
export function isDateDisabled(date: IsoDate, today: IsoDate, ctx: RuleContext): boolean {
  if (date < today) return true;
  return (["A", "B"] as const).every((room) => getAvailableWindows(room, date, ctx).length === 0);
}

function withinAnyWindow(startMin: number, endMin: number, windows: TimeWindow[]): boolean {
  return windows.some((w) => toMinutes(w.start) <= startMin && endMin <= toMinutes(w.end));
}

// Checks the slot against the rules and registered rentals.
export function checkBooking(slot: SlotDraft, room: "A" | "B", ctx: RuleContext): CheckResult {
  if (!slot.start || !slot.end) {
    return { ok: false, reason: "請填開始和結束時間" };
  }
  if (!isValidHHmm(slot.start) || !isValidHHmm(slot.end)) {
    return { ok: false, reason: "時間格式不正確" };
  }

  const startMin = toMinutes(slot.start);
  const endMin = toMinutes(slot.end);

  // First line of defense: isCrossMidnight/start/end must be internally
  // consistent. Not inferred from end < start — see SlotDraft comment.
  if (!slot.isCrossMidnight && endMin <= startMin) {
    return { ok: false, reason: "結束時間必須晚於開始時間" };
  }
  if (slot.isCrossMidnight && endMin >= startMin) {
    return { ok: false, reason: "已勾選跨日，結束時間應該早於開始時間" };
  }

  const todayWindows = getAvailableWindows(room, slot.date, ctx);

  if (!slot.isCrossMidnight) {
    if (!withinAnyWindow(startMin, endMin, todayWindows)) {
      return { ok: false, reason: unavailableReason(room, slot.date, ctx, startMin, endMin) };
    }
    return { ok: true };
  }

  // Cross-midnight: split into [start, 24:00) on `date` and [00:00, end) on the next day.
  if (!withinAnyWindow(startMin, 1440, todayWindows)) {
    return { ok: false, reason: unavailableReason(room, slot.date, ctx, startMin, 1440) };
  }
  const nextDate = addDays(slot.date, 1);
  const nextWindows = getAvailableWindows(room, nextDate, ctx);
  if (!withinAnyWindow(0, endMin, nextWindows)) {
    return { ok: false, reason: unavailableReason(room, nextDate, ctx, 0, endMin) };
  }
  return { ok: true };
}

// Reports the specific rule reason (or rental-overlap reason) that blocks
// the given minute-range, for the error message shown on the card.
function unavailableReason(
  room: "A" | "B",
  date: IsoDate,
  ctx: RuleContext,
  startMin: number,
  endMin: number,
): string {
  const blockingRule = ruleBlocksForDay(room, date, ctx.rules).find(
    (b) => startMin < toMinutes(b.end) && toMinutes(b.start) < endMin,
  );
  if (blockingRule) return `${shortDateParts(date).monthDay} ${blockingRule.start}–${blockingRule.end}：${blockingRule.reason}`;

  const rentalRanges = registeredRentalRangesForDay(room, date, ctx.existingRentals);
  const blockingRental = rentalRanges.find(
    ([rStart, rEnd]) => startMin < rEnd && rStart < endMin,
  );
  if (blockingRental) {
    const [rStart, rEnd] = blockingRental;
    return `${minutesToHHmm(Math.max(0, rStart))}–${minutesToHHmm(Math.min(1440, rEnd))} 已有人預約`;
  }

  return "此時段無法預約";
}
