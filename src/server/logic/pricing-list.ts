import type { PricingPlan, RosterEntry } from "@/server/logic/pricing";
import { activeOnly } from "@/server/logic/active-only";
import type { RoleCode } from "@/server/supabase/codecs";

// 價格方案 cards (P01–P03): order and the 「使用中」 line.

const ROLE_ORDER: Partial<Record<RoleCode, number>> = { customer: 0, teacher: 1, staff: 2 };

function roleRank(plan: PricingPlan): number {
  return ROLE_ORDER[plan.category] ?? Object.keys(ROLE_ORDER).length;
}

// 客戶 → 老師 → 櫃檯, same role by name; archived plans last (shown only
// when 「顯示已停用」 is switched on).
export function sortPlans(plans: readonly PricingPlan[]): PricingPlan[] {
  return [...plans].sort(
    (a, b) =>
      Number(a.archivedAt !== null) - Number(b.archivedAt !== null) ||
      roleRank(a) - roleRank(b) ||
      a.appliesTo.localeCompare(b.appliesTo, "zh-Hant"),
  );
}

export type PlanUsage = {
  // Active people on the plan; archived ones neither count nor block 停用.
  people: RosterEntry[];
  count: number;
  label: string;
};

// The people a plan prices today. Archived people keep their plan id but are
// not in use (P02, P16).
export function planUsers(plan: PricingPlan, roster: readonly RosterEntry[]): RosterEntry[] {
  return activeOnly(roster).filter((person) => person.pricingPlanId === plan.id);
}

function usageLabel(plan: PricingPlan, people: readonly RosterEntry[]): string {
  if (plan.category === "customer") {
    return people.length === 0 ? "客戶" : `客戶＋${people.length} 位外部老師`;
  }
  if (people.length === 1 || people.length === 2) {
    return `${people.length} 位：${people.map((p) => p.name).join("、")}`;
  }
  return `${people.length} 位使用中`;
}

export function planUsage(plan: PricingPlan, roster: readonly RosterEntry[]): PlanUsage {
  const people = planUsers(plan, roster);
  return { people, count: people.length, label: usageLabel(plan, people) };
}
