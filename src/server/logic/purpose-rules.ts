import type { Purpose } from "@/server/logic/booking";
import { roleToLabel } from "@/server/supabase/codecs";
import type { RoleCode } from "@/server/supabase/codecs";

// Roles a purpose can be opened to; guest teachers never rent (B1).
export type BookingRole = Extract<RoleCode, "teacher" | "staff" | "customer">;

export const BOOKING_ROLES: readonly BookingRole[] = ["teacher", "staff", "customer"];

// How one role pays for a purpose (E-5, purpose_role_pricing).
// price: hourly price per room, both rooms set together, 0 = free.
// discount: pays payPercent% of the renter's plan, shared by both rooms (80 = 8 折).
export type RolePricing = { mode: "price"; roomA: number; roomB: number } | { mode: "discount"; payPercent: number };

// One purpose_settings row with its purpose_role_pricing rows.
export type PurposeSetting = {
  purpose: Purpose;
  allowedRoles: BookingRole[];
  // A missing role = 方案價格 (priced from the renter's own plan).
  rolePricing: Partial<Record<BookingRole, RolePricing>>;
  archivedAt: string | null;
};

// The booking form's purpose buttons, in their existing on-screen order.
export const BOOKING_PURPOSE_ORDER: readonly Purpose[] = [
  "dance",
  "private_lesson",
  "performance",
  "aerobics",
  "front_desk",
  "workshop",
  "photography",
  "yoga",
];

export const ARCHIVED_PURPOSE_REASON = "這個用途已停用";

// E08: an edit saved after someone else archived the purpose.
export const ARCHIVED_PURPOSE_EDIT_REASON = "這個用途已停用，啟用後才能編輯";

export type PurposeAvailability = { ok: true } | { ok: false; reason: string };

export type PurposeOption = { purpose: Purpose; availability: PurposeAvailability };

export function findPurposeSetting(purpose: Purpose, settings: readonly PurposeSetting[]): PurposeSetting | undefined {
  return settings.find((s) => s.purpose === purpose);
}

// 「僅限 老師、櫃檯」 — roles always listed in BOOKING_ROLES order.
export function onlyForRolesReason(roles: readonly BookingRole[]): string {
  return `僅限 ${BOOKING_ROLES.filter((r) => roles.includes(r)).map(roleToLabel).join("、")}`;
}

// 用途 B4: archived (or missing) purposes are closed to everyone; otherwise the
// renter's role has to be one the purpose is opened to. With no renter yet
// (role null) only the archived check applies.
export function purposeAvailability(
  purpose: Purpose,
  role: RoleCode | null,
  settings: readonly PurposeSetting[],
): PurposeAvailability {
  const setting = findPurposeSetting(purpose, settings);
  if (!setting || setting.archivedAt !== null) return { ok: false, reason: ARCHIVED_PURPOSE_REASON };
  if (role !== null && !(setting.allowedRoles as readonly RoleCode[]).includes(role)) {
    return { ok: false, reason: onlyForRolesReason(setting.allowedRoles) };
  }
  return { ok: true };
}

// T08: what the booking form offers. Archived purposes are left out entirely;
// ones closed to this role stay visible but disabled with the reason.
export function purposeOptions(settings: readonly PurposeSetting[], role: RoleCode): PurposeOption[] {
  return BOOKING_PURPOSE_ORDER.filter((purpose) => {
    const setting = findPurposeSetting(purpose, settings);
    return setting !== undefined && setting.archivedAt === null;
  }).map((purpose) => ({ purpose, availability: purposeAvailability(purpose, role, settings) }));
}

// F-用途-8: the purpose pre-selected whenever a renter is chosen. Rarely
// changes, so it stays in code; the purposes page also reads it to stop the
// default from being archived or closed to its role (用途 B3).
export function defaultPurposeFor(role: RoleCode): Purpose {
  return role === "staff" ? "front_desk" : "dance";
}
