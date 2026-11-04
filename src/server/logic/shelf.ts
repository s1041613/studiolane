// 預約冊 (the bookings window's shelf view): one sidebar folder is selected
// at a time, and the same registry below both draws the sidebar and
// decides each folder's rows — see shelfRows/shelfCount. The folder shape
// stays a discriminated union so a caller can switch on `kind` instead of
// stringly-typed ids.
import { ALL_STATUSES, matchesQuery, sortBookingsNewestFirst } from "@/server/logic/bookings";
import { conflictInfo, conflictRivals, rentalTouchesDate } from "@/server/logic/home-selectors";
import { addDays, isoWeekday, shortDateParts } from "@/server/logic/date";
import { roomToLabel, statusToLabel } from "@/server/supabase/codecs";
import type { RoomCode, RentalStatusCode } from "@/server/supabase/codecs";
import { RentalStatus } from "@/server/types/home";
import type { RentalSummary } from "@/server/types/home";

export type ShelfFolder =
  | { kind: "period"; period: "today" | "week" | "all" }
  | { kind: "room"; room: "A" | "B" }
  | { kind: "status"; status: RentalStatus }
  | { kind: "clash" };

export const DEFAULT_SHELF_FOLDER: ShelfFolder = { kind: "period", period: "all" };

// A stable identity for a folder: equality, React keys, and the lookup key
// into the registry below.
export function folderKey(folder: ShelfFolder): string {
  switch (folder.kind) {
    case "period":
      return `period:${folder.period}`;
    case "room":
      return `room:${folder.room}`;
    case "status":
      return `status:${folder.status}`;
    case "clash":
      return "clash";
  }
}

interface ShelfFolderEntry {
  folder: ShelfFolder;
  label: string;
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

function periodEntry(period: "today" | "week" | "all", label: string): ShelfFolderEntry {
  return {
    folder: { kind: "period", period },
    label,
    matches: (rental, { today }) => {
      if (period === "all") return true;
      if (!onCalendar(rental)) return false;
      return period === "today" ? rentalTouchesDate(rental, today) : inWeek(rental, today);
    },
  };
}

function roomEntry(room: RoomCode): ShelfFolderEntry {
  return { folder: { kind: "room", room }, label: roomToLabel(room), matches: (rental) => rental.room === room };
}

function statusEntry(status: RentalStatus): ShelfFolderEntry {
  return {
    folder: { kind: "status", status },
    label: statusToLabel(status as RentalStatusCode),
    matches: (rental) => rental.status === status,
  };
}

const CLASH_ENTRY: ShelfFolderEntry = {
  folder: { kind: "clash" },
  label: "撞單",
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

function entryFor(folder: ShelfFolder): ShelfFolderEntry {
  const key = folderKey(folder);
  const entry = SHELF_SECTIONS.flatMap((section) => section.items).find((item) => folderKey(item.folder) === key);
  if (!entry) throw new Error(`Unknown shelf folder: ${key}`);
  return entry;
}

// Every rental the folder shows, newest first; the caller applies the
// ?q= search on top (it ranks against every rental, same as 撞單, so it
// stays a separate step rather than folded in here).
export function shelfRows(all: RentalSummary[], folder: ShelfFolder, today: string): RentalSummary[] {
  const entry = entryFor(folder);
  return sortBookingsNewestFirst(all.filter((rental) => entry.matches(rental, { today, all })));
}

export function shelfCount(all: RentalSummary[], folder: ShelfFolder, today: string): number {
  const entry = entryFor(folder);
  return all.filter((rental) => entry.matches(rental, { today, all })).length;
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
