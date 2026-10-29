// ISO yyyy-mm-dd bounds; a single day has from === to.
export type DateRange = { from: string; to: string };

// The one-field range picker (user decision 2026-10-14, option A): the first
// click picks one day and keeps the calendar open; a second, different day
// turns it into a range and closes it; a click after a finished range (or
// on the same day again) starts over from that day.
export function nextDateRange(current: DateRange | null, clicked: string): { range: DateRange; close: boolean } {
  if (current && current.from === current.to && clicked !== current.from) {
    const [from, to] = [current.from, clicked].sort();
    return { range: { from, to }, close: true };
  }
  return { range: { from: clicked, to: clicked }, close: false };
}

// Days a hover would add to a one-day pick, shown as a lighter preview.
export function isInPreview(current: DateRange | null, hovered: string | null, day: string): boolean {
  if (!current || !hovered || current.from !== current.to) return false;
  const [lo, hi] = [current.from, hovered].sort();
  return day >= lo && day <= hi && day !== current.from;
}
