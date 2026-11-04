// 預約冊 (the bookings window's shelf view): three independent facets —
// period (exactly one selected), room (at most one, or every room), status
// (at most one, or every status) — combine by intersection. The same
// registry below drives the sidebar (SHELF_SECTIONS), the row filter
// (shelfRows/shelfCount), and the click/count helpers
// (withFolder/toggleFolder/folderActive), so a folder's matching rule lives
// in exactly one place.
import { ALL_STATUSES, matchesQuery, sortBookingsNewestFirst } from "@/server/logic/bookings";
import { conflictInfo, conflictRivals, rentalTouchesDate } from "@/server/logic/home-selectors";
import { addDays, isoWeekday, shortDateParts } from "@/server/logic/date";
import { roomToLabel, statusToLabel } from "@/server/supabase/codecs";
import type { RoomCode, RentalStatusCode } from "@/server/supabase/codecs";
import { RentalStatus } from "@/server/types/home";
import type { RentalSummary } from "@/server/types/home";

export type ShelfFilter = {
  period: "today" | "week" | "all";
  room: "A" | "B" | null;
  status: RentalStatus | "clash" | null;
};

export const DEFAULT_SHELF_FILTER: ShelfFilter = { period: "all", room: null, status: null };

type ShelfFacet = "period" | "room" | "status";

interface ShelfFolderEntry {
  key: string;
  label: string;
  facet: ShelfFacet;
  value: ShelfFilter[ShelfFacet];
  // `isClash` is read only by the sidebar, to turn its count red once it's
  // above zero; nothing else treats this entry differently from any other
  // status entry.
  isClash?: boolean;
  // `all` is only read by the clash entry (a rental's clash status depends
  // on every other rental, not just itself).
  matches: (rental: RentalSummary, ctx: { today: string; all: RentalSummary[] }) => boolean;
}

export interface ShelfSection {
  title: string;
  items: ShelfFolderEntry[];
}

// T-列表-2 reused: a cross-midnight rental belongs to both calendar days it
// touches. Shown on the calendar: every status except postponed/cancelled —
// those released their slot and no longer occupy a day.
const CALENDAR_STATUSES = new Set<RentalStatus>([
  RentalStatus.Pending,
  RentalStatus.AwaitingPayment,
  RentalStatus.Registered,
  RentalStatus.Completed,
]);

function onCalendar(rental: RentalSummary): boolean {
  return CALENDAR_STATUSES.has(rental.status);
}

// Monday–Sunday containing `today`, as the two ISO days at its ends.
function weekRange(today: string): { start: string; end: string } {
  const start = addDays(today, -(isoWeekday(today) - 1));
  return { start, end: addDays(start, 6) };
}

function inWeek(rental: RentalSummary, today: string): boolean {
  const { start, end } = weekRange(today);
  for (let day = start; day <= end; day = addDays(day, 1)) {
    if (rentalTouchesDate(rental, day)) return true;
  }
  return false;
}

function periodEntry(period: ShelfFilter["period"], label: string): ShelfFolderEntry {
  return {
    key: `period:${period}`,
    label,
    facet: "period",
    value: period,
    matches: (rental, { today }) => {
      if (period === "all") return true;
      if (!onCalendar(rental)) return false;
      return period === "today" ? rentalTouchesDate(rental, today) : inWeek(rental, today);
    },
  };
}

function roomEntry(room: RoomCode): ShelfFolderEntry {
  return { key: `room:${room}`, label: roomToLabel(room), facet: "room", value: room, matches: (rental) => rental.room === room };
}

function statusEntry(status: RentalStatus): ShelfFolderEntry {
  return {
    key: `status:${status}`,
    label: statusToLabel(status as RentalStatusCode),
    facet: "status",
    value: status,
    matches: (rental) => rental.status === status,
  };
}

const CLASH_ENTRY: ShelfFolderEntry = {
  key: "status:clash",
  label: "撞單",
  facet: "status",
  value: "clash",
  isClash: true,
  matches: (rental, { all }) => conflictInfo(rental, all) != null,
};

// 狀態: six statuses in ALL_STATUSES order, with 撞單 right after 待確認.
const STATUS_ITEMS: ShelfFolderEntry[] = ALL_STATUSES.flatMap((status) =>
  status === RentalStatus.Pending ? [statusEntry(status), CLASH_ENTRY] : [statusEntry(status)],
);

export const SHELF_SECTIONS: ShelfSection[] = [
  { title: "預約", items: [periodEntry("today", "今天"), periodEntry("week", "本週"), periodEntry("all", "全部")] },
  { title: "教室", items: [roomEntry("A"), roomEntry("B")] },
  { title: "狀態", items: STATUS_ITEMS },
];

function allEntries(): ShelfFolderEntry[] {
  return SHELF_SECTIONS.flatMap((section) => section.items);
}

function entryFor(facet: ShelfFacet, value: ShelfFilter[ShelfFacet]): ShelfFolderEntry | undefined {
  return allEntries().find((entry) => entry.facet === facet && entry.value === value);
}

// The filter one sidebar item represents on its own: this facet forced to
// the item's value, the other two left exactly as given. Used both for a
// sidebar item's faceted count (shelfCount against this) and, via
// toggleFolder, for selecting it.
export function withFolder(filter: ShelfFilter, entry: ShelfFolderEntry): ShelfFilter {
  return { ...filter, [entry.facet]: entry.value } as ShelfFilter;
}

export function folderActive(filter: ShelfFilter, entry: ShelfFolderEntry): boolean {
  return filter[entry.facet] === entry.value;
}

// Room and status are optional facets (null = every value), so clicking the
// one already selected clears it back to null. Period always holds exactly
// one value, so it only ever gets set, never cleared.
export function toggleFolder(filter: ShelfFilter, entry: ShelfFolderEntry): ShelfFilter {
  if (entry.facet !== "period" && folderActive(filter, entry)) {
    return { ...filter, [entry.facet]: null } as ShelfFilter;
  }
  return withFolder(filter, entry);
}

function matchesFilter(rental: RentalSummary, filter: ShelfFilter, ctx: { today: string; all: RentalSummary[] }): boolean {
  const period = entryFor("period", filter.period);
  if (!period?.matches(rental, ctx)) return false;
  if (filter.room !== null && !entryFor("room", filter.room)?.matches(rental, ctx)) return false;
  if (filter.status !== null && !entryFor("status", filter.status)?.matches(rental, ctx)) return false;
  return true;
}

// Every rental the filter shows, newest first; the caller applies the
// ?q= search on top (it ranks against every rental, same as 撞單, so it
// stays a separate step rather than folded in here).
export function shelfRows(all: RentalSummary[], filter: ShelfFilter, today: string): RentalSummary[] {
  return sortBookingsNewestFirst(all.filter((rental) => matchesFilter(rental, filter, { today, all })));
}

export function shelfCount(all: RentalSummary[], filter: ShelfFilter, today: string): number {
  return all.filter((rental) => matchesFilter(rental, filter, { today, all })).length;
}

// The ?q= search, applied on top of shelfRows.
export function searchShelfRows(rows: RentalSummary[], q: string): RentalSummary[] {
  return rows.filter((rental) => matchesQuery(rental, q));
}

// "撞 11/6 15:00 某某": the clash row's earliest-created rival, named so
// staff know which other booking to deal with first. Empty string when the
// rental doesn't currently clash.
export function rivalText(rental: RentalSummary, all: RentalSummary[]): string {
  const rivals = conflictRivals(rental, all);
  if (rivals.length === 0) return "";
  const earliest = [...rivals].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  const { monthDay } = shortDateParts(earliest.date);
  return `撞 ${monthDay} ${earliest.start} ${earliest.person}`;
}
