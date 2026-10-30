const WEEKDAY_ZH = ["日", "一", "二", "三", "四", "五", "六"];

// Same characters, indexed by isoWeekday()'s own numbering (1 = Monday …
// 7 = Sunday) instead of getUTCDay()'s (0 = Sunday), for the rental_rules
// weekday column. Index 0 is unused.
export const WEEKDAY_ZH_ISO = ["", "一", "二", "三", "四", "五", "六", "日"];

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

// 1 = Monday … 7 = Sunday, matching rental_rules.weekday (Postgres isodow).
export function isoWeekday(iso: string): number {
  const day = parseIso(iso).getUTCDay();
  return day === 0 ? 7 : day;
}

export function addDays(iso: string, n: number): string {
  const d = parseIso(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
}

// A real yyyy-mm-dd day: the shape alone lets 2026-02-31 or 2026-13-01 through.
export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && addDays(value, 0) === value;
}

export function formatDateZh(iso: string): string {
  const d = parseIso(iso);
  return `${d.getUTCFullYear()} 年 ${d.getUTCMonth() + 1} 月 ${d.getUTCDate()} 日（${WEEKDAY_ZH[d.getUTCDay()]}）`;
}

// Matches the single-character format already stored in 教室租借's 星期 column.
export function weekdayZh(iso: string): string {
  return WEEKDAY_ZH[parseIso(iso).getUTCDay()];
}

// The two halves of shortDate, for tables that line the weekday up in a
// column whatever the day's digit count (10/7 vs 10/10).
export function shortDateParts(iso: string): { monthDay: string; weekday: string } {
  const d = parseIso(iso);
  return { monthDay: `${d.getUTCMonth() + 1}/${d.getUTCDate()}`, weekday: `（${WEEKDAY_ZH[d.getUTCDay()]}）` };
}

export function shortDate(iso: string): string {
  const { monthDay, weekday } = shortDateParts(iso);
  return `${monthDay}${weekday}`;
}

// The business runs on Asia/Taipei time; UTC's date lags Taipei's by a day
// between 00:00 and 08:00 local time.
export function todayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
