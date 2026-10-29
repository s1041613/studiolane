// react-day-picker hands back Date objects constructed from local
// year/month/day (not UTC), so conversions here must use local getters to
// match — parseIso/toIsoDate elsewhere in the app are UTC-based and would
// shift the date by one day around midnight in non-UTC timezones.
export function calendarDateToIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function isoToCalendarDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
