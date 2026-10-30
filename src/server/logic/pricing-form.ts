import type { PricingPlan, RosterEntry } from "@/server/logic/pricing";
import { planUsers } from "@/server/logic/pricing-list";
import type { PlanUsage } from "@/server/logic/pricing-list";
import { sameName } from "@/server/logic/roster";
import { formatRate, parseRate } from "@/server/logic/settings-form";
import { roleToLabel } from "@/server/supabase/codecs";

// 價格方案 新增／編輯 dialog (I-01–I-06) and the 停用 check (I-05, B6).

export type PlanRole = "teacher" | "staff" | "customer";
export type Room = "A" | "B";

// What the dialog holds: rates stay text so a half-typed value isn't lost.
export type PlanDraft = { name: string; role: PlanRole; roomARate: string; roomBRate: string };
export type PlanField = keyof PlanDraft;
export type PlanFieldErrors = Partial<Record<PlanField, string>>;

export type ValidPlan = { name: string; role: PlanRole; roomARate: number; roomBRate: number };
export type PlanValidation = { ok: true; plan: ValidPlan } | { ok: false; errors: PlanFieldErrors };

export const MAX_PLAN_NAME = 20;
export const CUSTOMER_PLAN_TAKEN = "客戶方案只能有一個";
export const ROLE_LOCKED_HINT = "身分建立後不能修改";

const RATE_FIELD: Record<Room, "roomARate" | "roomBRate"> = { A: "roomARate", B: "roomBRate" };
const ROOMS: readonly Room[] = ["A", "B"];

export function sameNameError(name: string): string {
  return `已有「${name.trim()}」，請換一個名稱`;
}

// The one active plan whose name collides with `name` (B2: unique among
// active plans, trimmed, case-insensitive — same as the DB index).
export function activeNamesake(name: string, plans: readonly PricingPlan[], exceptId: string | null): PricingPlan | null {
  return plans.find((p) => p.archivedAt === null && p.id !== exceptId && sameName(p.appliesTo, name)) ?? null;
}

function validateName(name: string, plans: readonly PricingPlan[], editingId: string | null): string | null {
  const trimmed = name.trim();
  if (trimmed === "") return "請填方案名稱";
  if ([...trimmed].length > MAX_PLAN_NAME) return `方案名稱最多 ${MAX_PLAN_NAME} 字`;
  return activeNamesake(trimmed, plans, editingId) ? sameNameError(trimmed) : null;
}

export const ROLE_REQUIRED = "請選老師或櫃檯";

// B4 at runtime: the draft comes from the client, so its role is any string
// until checked. A new plan is a teacher or staff plan; the one customer plan
// already exists (B1) and is never created here.
function newPlanRoleError(role: string): string | null {
  if (role === "teacher" || role === "staff") return null;
  return role === "customer" ? CUSTOMER_PLAN_TAKEN : ROLE_REQUIRED;
}

// Shared by the dialog and the server actions (which re-read the plans).
// `editingId` is the plan being edited, so it may keep its own name; its role
// is checked by the action (B5), not here.
export function validatePlanDraft(
  draft: PlanDraft,
  plans: readonly PricingPlan[],
  editingId: string | null,
): PlanValidation {
  const errors: PlanFieldErrors = {};
  const nameError = validateName(draft.name, plans, editingId);
  if (nameError) errors.name = nameError;
  const roleError = editingId === null ? newPlanRoleError(draft.role) : null;
  if (roleError) errors.role = roleError;
  const roomA = parseRate(draft.roomARate);
  const roomB = parseRate(draft.roomBRate);
  if (!roomA.ok) errors.roomARate = roomA.reason;
  if (!roomB.ok) errors.roomBRate = roomB.reason;

  if (!roomA.ok || !roomB.ok || Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    plan: { name: draft.name.trim(), role: draft.role, roomARate: roomA.value, roomBRate: roomB.value },
  };
}

export type PlanRoleOption = { value: PlanRole; label: string; disabled?: boolean };

// P05 / B4: the customer plan is unique, so 客戶 can't be picked for a new one.
export function roleOptions(): PlanRoleOption[] {
  return [
    { value: "teacher", label: roleToLabel("teacher") },
    { value: "staff", label: roleToLabel("staff") },
    { value: "customer", label: roleToLabel("customer"), disabled: true },
  ];
}

// --- dialog state ------------------------------------------------------------

export type PlanForm = {
  editingId: string | null;
  // B5: a plan's role is fixed once created.
  roleLocked: boolean;
  initial: PlanDraft;
  draft: PlanDraft;
  errors: PlanFieldErrors;
};

export type PlanFormMode = "create" | { edit: PricingPlan };

// Only the three roles a plan can have; guest teachers ride the customer plan.
function planRole(plan: PricingPlan): PlanRole {
  return plan.category === "guest_teacher" ? "customer" : plan.category;
}

export function initPlanForm(mode: PlanFormMode): PlanForm {
  const draft: PlanDraft =
    mode === "create"
      ? { name: "", role: "teacher", roomARate: "", roomBRate: "" }
      : {
          name: mode.edit.appliesTo,
          role: planRole(mode.edit),
          roomARate: formatRate(mode.edit.roomARate),
          roomBRate: formatRate(mode.edit.roomBRate),
        };
  return {
    editingId: mode === "create" ? null : mode.edit.id,
    roleLocked: mode !== "create",
    initial: draft,
    draft,
    errors: {},
  };
}

export type PlanFormAction =
  | { type: "setName"; value: string }
  | { type: "setRole"; value: PlanRole }
  | { type: "setRate"; room: Room; value: string }
  // I-02: on blur a valid rate gets its thousands separators.
  | { type: "formatRate"; room: Room }
  | { type: "serverErrors"; errors: PlanFieldErrors };

function withField(state: PlanForm, field: PlanField, value: string): PlanForm {
  const errors = Object.fromEntries(Object.entries(state.errors).filter(([key]) => key !== field)) as PlanFieldErrors;
  return { ...state, draft: { ...state.draft, [field]: value }, errors };
}

export function planFormReducer(state: PlanForm, action: PlanFormAction): PlanForm {
  switch (action.type) {
    case "setName":
      return withField(state, "name", action.value);
    case "setRole":
      return state.roleLocked ? state : withField(state, "role", action.value);
    case "setRate":
      return withField(state, RATE_FIELD[action.room], action.value);
    case "formatRate": {
      const field = RATE_FIELD[action.room];
      const parsed = parseRate(state.draft[field]);
      return parsed.ok ? { ...state, draft: { ...state.draft, [field]: formatRate(parsed.value) } } : state;
    }
    case "serverErrors":
      return { ...state, errors: action.errors };
  }
}

// I-06: compares values, so retyping 500 as "500" or "500 " is not a change.
function sameValue(field: PlanField, a: string, b: string): boolean {
  if (field === "roomARate" || field === "roomBRate") {
    const [pa, pb] = [parseRate(a), parseRate(b)];
    if (pa.ok && pb.ok) return pa.value === pb.value;
  }
  return field === "name" ? a.trim() === b.trim() : a === b;
}

export function isPlanFormDirty(form: PlanForm): boolean {
  return (Object.keys(form.draft) as PlanField[]).some((field) => !sameValue(field, form.initial[field], form.draft[field]));
}

// --- 調價 (I-03) ---------------------------------------------------------------

export type RateChange = { room: Room; from: number; to: number };

// Rooms whose hourly rate the draft changes; a rate that doesn't parse yet is
// not a change (its field shows the error instead).
export function rateChanges(plan: PricingPlan, draft: PlanDraft): RateChange[] {
  const current: Record<Room, number> = { A: plan.roomARate, B: plan.roomBRate };
  return ROOMS.flatMap((room) => {
    const next = parseRate(draft[RATE_FIELD[room]]);
    return next.ok && next.value !== current[room] ? [{ room, from: current[room], to: next.value }] : [];
  });
}

function audience(plan: PricingPlan, usage: PlanUsage): string {
  if (plan.category === "customer") return usage.count === 0 ? "客戶" : `客戶與 ${usage.count} 位外部老師`;
  return `${usage.count} 位${roleToLabel(plan.category)}`;
}

// 「A 間 500 → 900，影響 21 位老師之後的新預約。」
export function rateChangeSummary(changes: readonly RateChange[], plan: PricingPlan, usage: PlanUsage): string {
  const what = changes.map((c) => `${c.room} 間 ${formatRate(c.from)} → ${formatRate(c.to)}`).join("、");
  const who = audience(plan, usage);
  // A space between Chinese and a number, as everywhere else on the page.
  return `${what}，影響${/^\d/.test(who) ? " " : ""}${who}之後的新預約。`;
}

// --- 停用 (I-05, B6, B7) -------------------------------------------------------

export type ArchiveCheck =
  | { ok: true }
  | { ok: false; reason: "customer" }
  | { ok: false; reason: "in_use"; people: RosterEntry[] };

// B6 lives here rather than in a trigger: only active people block, and the
// server action re-runs it against a fresh roster.
export function canArchivePlan(plan: PricingPlan, roster: readonly RosterEntry[]): ArchiveCheck {
  if (plan.category === "customer") return { ok: false, reason: "customer" };
  const people = planUsers(plan, roster);
  return people.length > 0 ? { ok: false, reason: "in_use", people } : { ok: true };
}

const NAMED_IN_USE = 5;

// 「老師價還有 21 位人員在用：示範小雨、示範小橘、示範小月…。請先到人員名單幫他們換方案。」
export function planInUseMessage(plan: PricingPlan, people: readonly RosterEntry[]): string {
  const names = people.slice(0, NAMED_IN_USE).map((p) => p.name).join("、");
  const more = people.length > NAMED_IN_USE ? "…" : "";
  return `${plan.appliesTo}還有 ${people.length} 位人員在用：${names}${more}。請先到人員名單幫他們換方案。`;
}

export const CUSTOMER_PLAN_ARCHIVE_ERROR = "客戶方案不能停用";
export const REACTIVATE_NAME_TAKEN = "已有同名的方案，請先改名";
