import type { PricingPlan, RosterEntry } from "@/server/logic/pricing";
import type { RoleCode } from "@/server/supabase/codecs";

// The five seed plans (docs/settings/pricing/02-bdd, 今天 10/13) plus helpers
// for the people who use them. Local to the pricing tests on purpose: the
// shared SAMPLE_PLANS rates belong to other pages' scenarios.

export function plan(id: string, category: RoleCode, appliesTo: string, roomARate: number, roomBRate: number): PricingPlan {
  return { id, category, appliesTo, roomARate, roomBRate, archivedAt: null };
}

export const GENERAL = plan("general", "customer", "一般價", 1250, 610);
export const TEACHER_PLAN = plan("teacher", "teacher", "老師價", 500, 250);
export const AXING_PLAN = plan("demo_star", "teacher", "專屬價一", 450, 200);
export const LULU_PLAN = plan("demo_lulu", "teacher", "專屬價二", 450, 200);
export const STAFF_PLAN = plan("staff", "staff", "櫃檯價", 0, 0);

export const SEED_PLANS: PricingPlan[] = [GENERAL, TEACHER_PLAN, AXING_PLAN, LULU_PLAN, STAFF_PLAN];

export function person(
  name: string,
  pricingPlanId: string,
  overrides: Partial<Omit<RosterEntry, "name" | "pricingPlanId">> = {},
): RosterEntry {
  return {
    id: name,
    name,
    email: "",
    phone: "",
    role: "teacher",
    pricingPlanId,
    instagram: "",
    archivedAt: null,
    ...overrides,
  };
}

export const ARCHIVED_AT = "2026-09-01T00:00:00Z";
