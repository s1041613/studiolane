import { WEEKDAY_ZH_ISO, addDays, isoWeekday, shortDateParts } from "@/server/logic/date";
import { mergeRanges, minutesToHHmm, subtractRanges, toMinutes } from "@/server/logic/booking-rules";
import type { HHmm, IsoDate } from "@/server/logic/booking";
import type { MinuteRange, RentalRule } from "@/server/logic/booking-rules";

// What the 租借時段 settings page shows: one line per DB row, never merged,
// so each weekday can be edited or archived on its own.

export function weekdayLabel(weekday: number): string {
  return `週${WEEKDAY_ZH_ISO[weekday]}`;
}

export function weekStartOf(date: IsoDate): IsoDate {
  return addDays(date, 1 - isoWeekday(date));
}

function onDay(rule: RentalRule, date: IsoDate): boolean {
  return rule.onDate === null ? rule.weekday === isoWeekday(date) : rule.onDate === date;
}

function intersectRanges([start, end]: MinuteRange, others: readonly MinuteRange[]): MinuteRange[] {
  return mergeRanges(
    others.map(([s, e]): MinuteRange => [Math.max(start, s), Math.min(end, e)]).filter(([s, e]) => s < e),
  );
}

// One stretch of a row on a day. A weekly block that an opening covers is
// split the way bookings see it (B1): the parts still blocked, and the parts
// lifted that day (drawn faded and struck in the week view).
export type WeekEntry = { rule: RentalRule; start: HHmm; end: HHmm; lifted: boolean };
export type WeekDay = { date: IsoDate; weekday: number; entries: WeekEntry[] };

function entriesFor(rule: RentalRule, opens: readonly MinuteRange[]): WeekEntry[] {
  const whole: MinuteRange = [toMinutes(rule.start), toMinutes(rule.end)];
  const piece = (lifted: boolean) => ([s, e]: MinuteRange): WeekEntry => ({
    rule,
    start: minutesToHHmm(s),
    end: minutesToHHmm(e),
    lifted,
  });
  if (rule.effect === "open" || rule.onDate !== null) return [piece(false)(whole)];
  return [...subtractRanges(whole, opens).map(piece(false)), ...intersectRanges(whole, opens).map(piece(true))];
}

// T01: the seven days from `weekStart` (a Monday) for one room — that room's
// and both rooms' active rows, weekly ones plus one-day ones dated that day.
export function rulesForWeek(rules: readonly RentalRule[], weekStart: IsoDate, room: "A" | "B"): WeekDay[] {
  const forRoom = rules.filter((r) => r.archivedAt === null && (r.room === null || r.room === room));
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    const today = forRoom.filter((r) => onDay(r, date));
    const opens: MinuteRange[] = today
      .filter((r) => r.effect === "open")
      .map((r) => [toMinutes(r.start), toMinutes(r.end)]);
    return {
      date,
      weekday: i + 1,
      entries: today.flatMap((rule) => entriesFor(rule, opens)).sort((a, b) => a.start.localeCompare(b.start)),
    };
  });
}

// N03: one-day rows belong to the week they fall in.
export function visibleInWeek(rule: RentalRule, weekStart: IsoDate): boolean {
  return rule.onDate === null || (weekStart <= rule.onDate && rule.onDate <= addDays(weekStart, 6));
}

// T02: weekly rows by weekday then start, then one-day rows by date then start.
export function sortRulesForList(rules: readonly RentalRule[]): RentalRule[] {
  const key = (r: RentalRule) => (r.onDate === null ? `0-${r.weekday}` : `1-${r.onDate}`);
  return [...rules].sort((a, b) => key(a).localeCompare(key(b)) || a.start.localeCompare(b.start));
}

// The list's 星期／日期 column: 「週一」 or 「12/13（日）」.
export function ruleDayLabel(rule: RentalRule): string {
  if (rule.onDate === null) return weekdayLabel(rule.weekday);
  return `${shortDateParts(rule.onDate).monthDay}（${WEEKDAY_ZH_ISO[rule.weekday]}）`;
}

export function ruleRoomLabel(room: RentalRule["room"]): string {
  return room ?? "A、B";
}
