import type { Purpose } from "@/server/logic/booking";
import { findPurposeSetting } from "@/server/logic/purpose-rules";
import type { BookingRole, PurposeSetting, RolePricing } from "@/server/logic/purpose-rules";
import type { RoleCode } from "@/server/supabase/codecs";

// 折扣 is typed the way shops say it (8 = 8 折, 8.5 = 85 折) and stored as
// the integer percent paid (pay_percent 10–99), so prices never meet floats.

export const ZHE_ERROR = "請填 1–9.9：8 折填 8，85 折填 8.5";

export type ParsedPayPercent = { ok: true; value: number } | { ok: false; reason: string };

// R09 / T04: 1–9.9 with at most one decimal; 10 would be no discount at all.
export function payPercentFromInput(input: string): ParsedPayPercent {
  const match = /^([1-9])(?:\.(\d))?$/.exec(input.trim());
  if (!match) return { ok: false, reason: ZHE_ERROR };
  return { ok: true, value: Number(match[1]) * 10 + Number(match[2] ?? 0) };
}

// R02 / T05: 80 → 「8 折」, 85 → 「85 折」.
export function zheLabel(payPercent: number): string {
  return `${payPercent % 10 === 0 ? payPercent / 10 : payPercent} 折`;
}

// T29 / E07 / E16: null for a missing purpose, a role the purpose isn't
// opened to (guest_teacher included — it's never in allowedRoles), or a role
// that's opened but has no pricing row (方案價格). A role's pricing is
// ignored whenever it isn't currently allowed, even if a row still exists
// for it (E16: direct DB edits, or a role closed after it was priced).
export function rolePricingFor(
  purpose: Purpose,
  role: RoleCode,
  settings: readonly PurposeSetting[],
): RolePricing | null {
  const setting = findPurposeSetting(purpose, settings);
  if (!setting) return null;
  if (!(setting.allowedRoles as readonly RoleCode[]).includes(role)) return null;
  return setting.rolePricing[role as BookingRole] ?? null;
}
