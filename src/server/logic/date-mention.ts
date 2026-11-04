import type { IsoDate } from "@/server/logic/booking";
import type { DateMention } from "@/server/logic/kobeyee-parse";
import { addDays, isIsoDate, isoWeekday, parseIso } from "@/server/logic/date";

export type DateMentionResolution = {
  date: IsoDate;
  // True when the model left the year out and this picked one, so the UI
  // can mark the date for staff to confirm (SlotReview.inferred.year).
  inferredYear: boolean;
};

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

// null for a calendar date that can't exist (2026-02-30): the day rolls
// into the next month under UTC arithmetic, so isIsoDate catches it by
// checking the string survives a round trip through addDays(_, 0).
function isoFromParts(year: number, month: number, day: number): IsoDate | null {
  const candidate = `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
  return isIsoDate(candidate) ? candidate : null;
}

function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.abs(parseIso(a).getTime() - parseIso(b).getTime()) / 86_400_000;
}

// No year in the text: try the year before, the year of, and the year
// after today, and keep whichever produces the date closest to today.
function resolveAbsoluteYear(month: number, day: number, today: IsoDate): DateMentionResolution | null {
  const todayYear = Number(today.slice(0, 4));
  let best: { date: IsoDate; distance: number } | null = null;
  for (const year of [todayYear - 1, todayYear, todayYear + 1]) {
    const candidate = isoFromParts(year, month, day);
    if (candidate === null) continue;
    const distance = daysBetween(today, candidate);
    if (best === null || distance < best.distance) best = { date: candidate, distance };
  }
  return best === null ? null : { date: best.date, inferredYear: true };
}

// The Monday that starts the week containing `iso` (isoWeekday is 1..7,
// Monday..Sunday, so this never crosses into a prior or later week by
// mistake the way Date.getUTCDay()'s Sunday-first numbering would).
function mondayOfWeek(iso: IsoDate): IsoDate {
  return addDays(iso, -(isoWeekday(iso) - 1));
}

function resolveWeekday(mention: DateMention & { kind: "weekday" }, today: IsoDate): DateMentionResolution {
  const monday = mondayOfWeek(today);
  const weekOffset = mention.week === "this" ? 0 : 7;
  return { date: addDays(monday, weekOffset + mention.weekday - 1), inferredYear: false };
}

// Pure: resolves what the model read from the text (DateMention) against a
// known "today" into an actual calendar date. Kept out of the model so the
// rules (week starts Monday, closest-year for an omitted year) are
// unit-tested here instead of depending on the prompt getting it right.
// Returns null for an impossible date (2/30) rather than throwing, since an
// AI session should not take down the extraction over that.
export function resolveDateMention(mention: DateMention, today: IsoDate): DateMentionResolution | null {
  switch (mention.kind) {
    case "relative_day":
      return { date: addDays(today, mention.offset), inferredYear: false };
    case "weekday":
      return resolveWeekday(mention, today);
    case "absolute": {
      if (mention.year !== null) {
        const date = isoFromParts(mention.year, mention.month, mention.day);
        return date === null ? null : { date, inferredYear: false };
      }
      return resolveAbsoluteYear(mention.month, mention.day, today);
    }
  }
}
