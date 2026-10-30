import type { HHmm, TimeWindow } from "@/server/logic/booking";

const STEP_MIN = 30;

function toMinutes(hhmm: HHmm): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function toHHmm(min: number): HHmm {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Half-hour-step candidates within the given windows — the Combobox's
// suggestion list. Users can still type an off-grid value directly (see
// time-combobox.tsx), this only shapes the clickable suggestions.
export function candidatesInWindows(windows: TimeWindow[]): HHmm[] {
  const out: HHmm[] = [];
  for (const w of windows) {
    const start = Math.ceil(toMinutes(w.start) / STEP_MIN) * STEP_MIN;
    const end = toMinutes(w.end);
    for (let m = start; m < end; m += STEP_MIN) {
      out.push(toHHmm(m));
    }
    // Include the window's own end as a selectable candidate (e.g. "24:00").
    if (end % STEP_MIN === 0) out.push(toHHmm(end));
  }
  return out;
}

// End-time candidates after a given start, restricted to same-day windows.
export function endCandidatesAfter(windows: TimeWindow[], start: HHmm): HHmm[] {
  const startMin = toMinutes(start);
  return candidatesInWindows(windows).filter((c) => toMinutes(c) > startMin);
}

// Settings forms (上課時段、租借規則、課程) aren't limited by free time: every
// half hour of the day, 00:00 through 24:00. Off-grid times can still be typed.
export function allDayCandidates(): HHmm[] {
  return candidatesInWindows([{ start: "00:00", end: "24:00" }]);
}
