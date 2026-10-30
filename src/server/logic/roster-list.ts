import type { RosterEntry } from "@/server/logic/pricing";
import type { RoleCode } from "@/server/supabase/codecs";

// The roles the roster settings page manages, in display order (R01).
// customer has no roster rows; it only exists on pricing plans.
export const ROSTER_ROLES = ["teacher", "staff", "guest_teacher"] as const satisfies readonly RoleCode[];
export type RosterRole = (typeof ROSTER_ROLES)[number];

export type RoleFilter = "all" | RosterRole;

export type RosterQuery = {
  search: string;
  role: RoleFilter;
  showArchived: boolean;
};

export type RosterListResult = {
  rows: RosterEntry[];
  // 「顯示已停用（N）」: every archived person, regardless of search and role.
  archivedCount: number;
};

function roleRank(role: RoleCode): number {
  const rank = ROSTER_ROLES.indexOf(role as RosterRole);
  return rank === -1 ? ROSTER_ROLES.length : rank;
}

function archivedRank(entry: RosterEntry): number {
  return entry.archivedAt === null ? 0 : 1;
}

// R01 / T01: role first, then active before archived, then name (zh-Hant).
export function sortRoster(people: readonly RosterEntry[]): RosterEntry[] {
  return [...people].sort(
    (a, b) =>
      roleRank(a.role) - roleRank(b.role) ||
      archivedRank(a) - archivedRank(b) ||
      a.name.localeCompare(b.name, "zh-Hant"),
  );
}

function stripPhoneSeparators(text: string): string {
  return text.replace(/[-\s]/g, "");
}

// R02 / T02: name and IG case-insensitively; phone ignoring "-" and spaces.
function matchesSearch(entry: RosterEntry, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (needle === "") return true;
  if (entry.name.toLowerCase().includes(needle)) return true;
  if (entry.instagram.toLowerCase().includes(needle)) return true;
  const phoneNeedle = stripPhoneSeparators(needle);
  return phoneNeedle !== "" && stripPhoneSeparators(entry.phone).includes(phoneNeedle);
}

export function filterRoster(people: readonly RosterEntry[], query: RosterQuery): RosterListResult {
  const rows = sortRoster(people).filter(
    (entry) =>
      (query.showArchived || entry.archivedAt === null) &&
      (query.role === "all" || entry.role === query.role) &&
      matchesSearch(entry, query.search),
  );
  const archivedCount = people.filter((entry) => entry.archivedAt !== null).length;
  return { rows, archivedCount };
}
