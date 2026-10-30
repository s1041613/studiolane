import { isValidHHmm, mergeRanges, minutesToHHmm, toMinutes } from "@/server/logic/booking-rules";
import type { RentalRule } from "@/server/logic/booking-rules";
import type { HHmm, IsoDate, TimeWindow } from "@/server/logic/booking";
import { isoWeekday } from "@/server/logic/date";

// 可排課的時段 (docs/rental-time-rules AC01–AC06): classes run in room A only,
// inside room A's 上課時段 (kind class_hours) — weekly rows plus that date's
// rows. 租借規則 (kind rental: 平日白天, maintenance, one-day openings) never
// change it. Shared by the class form and its 上課時段 dialog
// (X4: don't let a change push classes outside).

// TimeRangePicker's rule, shared by every settings form: 10-minute steps, same day,
// end later than start. 24:00 is a valid end.
export function timeRangeError(start: string, end: string): string | null {
  if (!start || !end) return "請填開始和結束時間";
  if (!isValidHHmm(start) || !isValidHHmm(end) || start === "24:00") return "時間格式不正確";
  if (toMinutes(start) % 10 !== 0 || toMinutes(end) % 10 !== 0) return "時間要以 10 分鐘為單位";
  if (toMinutes(end) <= toMinutes(start)) return "結束要晚於開始";
  return null;
}

function toWindows(ranges: Array<[number, number]>): TimeWindow[] {
  return mergeRanges(ranges).map(([start, end]) => ({ start: minutesToHHmm(start), end: minutesToHHmm(end) }));
}

// Active 上課時段 that cover room A (A, or both rooms).
function classHoursForRoomA(rules: readonly RentalRule[]): RentalRule[] {
  return rules.filter((r) => r.kind === "class_hours" && r.room !== "B" && r.archivedAt === null);
}

function windowsOf(rows: readonly RentalRule[]): TimeWindow[] {
  return toWindows(rows.map((r) => [toMinutes(r.start), toMinutes(r.end)]));
}

// A regular class's range: the weekly 上課時段 on that weekday.
export function schedulingRangeFor(weekday: number, rules: readonly RentalRule[]): TimeWindow[] {
  return windowsOf(classHoursForRoomA(rules).filter((r) => r.onDate === null && r.weekday === weekday));
}

// A dated class's range: that weekday's weekly 上課時段 plus that date's own.
export function schedulingRangeOn(date: IsoDate, rules: readonly RentalRule[]): TimeWindow[] {
  const weekday = isoWeekday(date);
  return windowsOf(
    classHoursForRoomA(rules).filter((r) => (r.onDate === null ? r.weekday === weekday : r.onDate === date)),
  );
}

export function isWithinRange(start: HHmm, end: HHmm, range: readonly TimeWindow[]): boolean {
  const [s, e] = [toMinutes(start), toMinutes(end)];
  return range.some((w) => toMinutes(w.start) <= s && e <= toMinutes(w.end));
}

// The range a class has to fit: its weekday's weekly range, or that one
// date's range for a dated class (T13 / T14).
export function rangeForSession(weekday: number, sessionDate: IsoDate | null, rules: readonly RentalRule[]): TimeWindow[] {
  return sessionDate === null ? schedulingRangeFor(weekday, rules) : schedulingRangeOn(sessionDate, rules);
}

// I-05 / K12 / K19: 「超出週一可排課的時段（17:30–22:30），請先到上課時段修改」.
// `when` is 「週一」 for a weekly class or 「11/3」 for a dated one.
export function outsideRangeMessage(when: string, range: readonly TimeWindow[], fix: string = "請先到上課時段修改"): string {
  const windows = range.length === 0 ? "沒有可排課的時段" : range.map((w) => `${w.start}–${w.end}`).join("、");
  return `超出${when}可排課的時段（${windows}），${fix}`;
}

// TimeRangePicker tidies what was typed when its list closes: 「1330」,
// 「9:30」 and a full-width colon become 「13:30」/「09:30」; anything it can't
// read is left as typed so the error message shows against it.
export function normalizeTimeInput(raw: string): string {
  const value = raw.trim().replace("：", ":");
  const match = value.match(/^(\d{1,2}):?(\d{2})?$/);
  if (!match) return value;
  const [, hours, minutes = "00"] = match;
  return `${hours.padStart(2, "0")}:${minutes}`;
}
