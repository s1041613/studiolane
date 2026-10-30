import type { Purpose } from "@/server/logic/booking";
import { findPurposeSetting } from "@/server/logic/purpose-rules";
import type { BookingRole, PurposeSetting } from "@/server/logic/purpose-rules";
import { zheLabel } from "@/server/logic/purpose-pricing";
import { formatRates } from "@/server/logic/settings-form";
import { purposeToLabel } from "@/server/supabase/codecs";

// The purposes page's fixed row order (docs/settings/shared/01, 用途).
export const PURPOSE_SETTINGS_ORDER: readonly Purpose[] = [
  "dance",
  "aerobics",
  "yoga",
  "performance",
  "workshop",
  "private_lesson",
  "front_desk",
  "photography",
];

export type RoleCell = { text: string; muted: boolean };

export type PurposeRow = {
  purpose: Purpose;
  label: string;
  teacher: RoleCell;
  staff: RoleCell;
  customer: RoleCell;
  archivedAt: string | null;
};

// 01 §4: 不開放／方案價格 are shown muted (grey); an actual price or
// discount is shown in the normal text color.
function roleCell(setting: PurposeSetting, role: BookingRole): RoleCell {
  if (!setting.allowedRoles.includes(role)) return { text: "不開放", muted: true };
  const pricing = setting.rolePricing[role];
  if (!pricing) return { text: "方案價格", muted: true };
  const text = pricing.mode === "price" ? formatRates(pricing.roomA, pricing.roomB) : zheLabel(pricing.payPercent);
  return { text, muted: false };
}

// U01 / T01–T03: one row per purpose in the fixed order, with each role's
// pricing in its own cell. Archived rows stay in place but only show once
// 「顯示已停用」 is switched on.
export function purposeRows(settings: readonly PurposeSetting[], { showArchived }: { showArchived: boolean }): PurposeRow[] {
  return PURPOSE_SETTINGS_ORDER.flatMap((purpose) => {
    const setting = findPurposeSetting(purpose, settings);
    if (!setting || (setting.archivedAt !== null && !showArchived)) return [];
    return [
      {
        purpose,
        label: purposeToLabel(purpose),
        teacher: roleCell(setting, "teacher"),
        staff: roleCell(setting, "staff"),
        customer: roleCell(setting, "customer"),
        archivedAt: setting.archivedAt,
      },
    ];
  });
}

export function archivedPurposeCount(settings: readonly PurposeSetting[]): number {
  return settings.filter((s) => s.archivedAt !== null).length;
}
