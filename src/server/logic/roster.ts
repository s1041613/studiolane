import type { RosterEntry } from "@/server/logic/pricing";
import { activeOnly } from "@/server/logic/active-only";
import { roleToLabel } from "@/server/supabase/codecs";

// Roster names match case-insensitively, ignoring surrounding spaces —
// shared by the roster combobox and the roster form.
export function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// Same-named people are told apart in the picker by their IG handle, or by
// their role when they have none; "" when the name is unique in the list.
export function namesakeHint(entry: RosterEntry, people: RosterEntry[]): string {
  const hasNamesake = people.some((other) => other.id !== entry.id && sameName(other.name, entry.name));
  if (!hasNamesake) return "";
  return entry.instagram ? `@${entry.instagram}` : roleToLabel(entry.role);
}

// Q-T5: guest teachers are on the roster only to cover other teachers'
// classes; neither the booking form nor its server re-check accepts them as
// renters. Archived people stay in this list so the server can name the
// reason a stale form fails (see resolveRenter).
export function rentableRoster(roster: RosterEntry[]): RosterEntry[] {
  return roster.filter((entry) => entry.role !== "guest_teacher");
}

// The booking form's renter picker: rentable and still active (roster R21).
export function bookableRenters(roster: RosterEntry[]): RosterEntry[] {
  return activeOnly(rentableRoster(roster));
}

const INSTAGRAM_HANDLE = /^[A-Za-z0-9._]{1,30}$/;
export const INSTAGRAM_ERROR = "IG 帳號只能有英文、數字、. 和 _，最多 30 字";

// S19 / I-09: accepts "@handle" and profile URLs (with or without www and a
// share query string) and keeps only the handle.
export function normalizeInstagram(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/[?#].*$/, "")
    .replace(/\/.*$/, "")
    .replace(/^@/, "");
}

export function isValidInstagram(handle: string): boolean {
  return INSTAGRAM_HANDLE.test(handle);
}
