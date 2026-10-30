// 人員名單 add / edit dialog as pure functions (docs/settings/shared/01 人員名單
// §3–§4), so every interaction is unit
// tested. The server action re-runs validateRosterDraft on what it receives.
import type { PricingPlan, RosterEntry } from "@/server/logic/pricing";
import { INSTAGRAM_ERROR, isValidInstagram, normalizeInstagram, sameName } from "@/server/logic/roster";
import { ROSTER_ROLES } from "@/server/logic/roster-list";
import type { RosterRole } from "@/server/logic/roster-list";
import { formatRate } from "@/server/logic/settings-form";
import { roleToLabel } from "@/server/supabase/codecs";
import type { RoleCode } from "@/server/supabase/codecs";

// What the dialog holds: the raw text of each field, as typed.
export type RosterDraft = {
  name: string;
  role: RosterRole;
  pricingPlanId: string;
  phone: string;
  email: string;
  instagram: string;
};

// What gets written: trimmed, phone as digits, blanks as null.
export type RosterInput = {
  name: string;
  role: RosterRole;
  pricingPlanId: string;
  phone: string | null;
  email: string | null;
  instagram: string | null;
};

export type RosterField = keyof RosterDraft;
export type RosterFieldErrors = Partial<Record<RosterField, string>>;

// Top-to-bottom order of the dialog; the first error gets the focus (T17).
export const ROSTER_FIELD_ORDER: readonly RosterField[] = ["name", "role", "pricingPlanId", "phone", "email", "instagram"];

const NAME_MAX = 30;
const PHONE_ERROR = "手機是 09 開頭共 10 碼，例：0912-345-678"; // gitleaks:allow
const EMAIL_ERROR = "Email 格式不正確";
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// B2: which pricing_plans.role each roster role may be put on.
const PLAN_CATEGORY: Record<RosterRole, RoleCode> = {
  teacher: "teacher",
  staff: "staff",
  guest_teacher: "customer",
};

// --- phone (B3, I-03) -------------------------------------------------------

export type NormalizedPhone = { ok: true; value: string | null } | { ok: false; reason: string };

export function normalizePhone(raw: string): NormalizedPhone {
  const digits = raw.replace(/[-\s]/g, "");
  if (digits === "") return { ok: true, value: null };
  return /^09\d{8}$/.test(digits) ? { ok: true, value: digits } : { ok: false, reason: PHONE_ERROR };
}

// 0912345678 → 0912-345-678; anything that isn't a valid mobile is left alone. gitleaks:allow
export function formatPhone(raw: string): string {
  const normalized = normalizePhone(raw);
  if (!normalized.ok || normalized.value === null) return raw;
  const d = normalized.value;
  return `${d.slice(0, 4)}-${d.slice(4, 7)}-${d.slice(7)}`;
}

// --- single-field checks (shared by blur and submit) -------------------------

function nameError(raw: string): string | undefined {
  const name = raw.trim();
  if (name === "") return "請填名字";
  return [...name].length > NAME_MAX ? `名字最多 ${NAME_MAX} 字` : undefined;
}

function emailError(raw: string): string | undefined {
  const email = raw.trim();
  return email === "" || EMAIL_SHAPE.test(email) ? undefined : EMAIL_ERROR;
}

function instagramError(raw: string): string | undefined {
  const handle = normalizeInstagram(raw);
  return handle === "" || isValidInstagram(handle) ? undefined : INSTAGRAM_ERROR;
}

export function isRosterRole(role: string): role is RosterRole {
  return (ROSTER_ROLES as readonly string[]).includes(role);
}

// B2: the plan must exist, fit the role and be active — also when editing
// someone whose plan has since been archived: they move to an active one.
export function planError(role: RosterRole, planId: string, plans: readonly PricingPlan[]): string | undefined {
  const plan = plans.find((p) => p.id === planId);
  if (!plan) return "請選價格方案";
  if (plan.category !== PLAN_CATEGORY[role]) return `這個價格方案不適用${roleToLabel(role)}`;
  if (plan.archivedAt !== null) return "這個價格方案已停用，請改選";
  return undefined;
}

// --- plan picker (I-01, I-07, R16) ------------------------------------------

export type PlanOptions = {
  plans: PricingPlan[];
  // 外部老師 always use the single customer plan (R09).
  locked: boolean;
  emptyMessage: string | null;
  canSubmit: boolean;
};

// Active plans for the role, in name order.
export function planOptionsFor(role: RosterRole, plans: readonly PricingPlan[]): PlanOptions {
  const options = plans
    .filter((p) => p.category === PLAN_CATEGORY[role] && p.archivedAt === null)
    .sort((a, b) => a.appliesTo.localeCompare(b.appliesTo, "zh-Hant"));
  const empty = options.length === 0;
  return {
    plans: options,
    locked: role === "guest_teacher",
    emptyMessage: empty ? `沒有適用${roleToLabel(role)}的價格方案，請先到價格方案新增` : null,
    canSubmit: !empty,
  };
}

// I-07: 「老師價 — A 500 / B 250 每小時」
export function planOptionLabel(plan: PricingPlan): string {
  return `${plan.appliesTo} — A ${formatRate(plan.roomARate)} / B ${formatRate(plan.roomBRate)} 每小時`;
}

function firstPlanId(role: RosterRole, plans: readonly PricingPlan[]): string {
  return planOptionsFor(role, plans).plans[0]?.id ?? "";
}

// I-08: reactivating someone whose plan was archived (or is gone) needs a new one.
export function needsPlanOnReactivate(entry: RosterEntry, plans: readonly PricingPlan[]): boolean {
  const plan = plans.find((p) => p.id === entry.pricingPlanId);
  return !plan || plan.archivedAt !== null;
}

// --- validation (R11–R16, B2) -----------------------------------------------

export type RosterValidation =
  | { ok: true; value: RosterInput }
  | { ok: false; errors: RosterFieldErrors; firstErrorField: RosterField };

export function validateRosterDraft(draft: RosterDraft, plans: readonly PricingPlan[]): RosterValidation {
  const phone = normalizePhone(draft.phone);
  const roleOk = isRosterRole(draft.role);
  const errors: RosterFieldErrors = {
    name: nameError(draft.name),
    role: roleOk ? undefined : "請選身分",
    pricingPlanId: roleOk ? planError(draft.role, draft.pricingPlanId, plans) : undefined,
    phone: phone.ok ? undefined : phone.reason,
    email: emailError(draft.email),
    instagram: instagramError(draft.instagram),
  };
  const firstErrorField = ROSTER_FIELD_ORDER.find((field) => errors[field] !== undefined);
  if (firstErrorField) {
    const present = Object.fromEntries(Object.entries(errors).filter(([, message]) => message !== undefined));
    return { ok: false, errors: present, firstErrorField };
  }
  return {
    ok: true,
    value: {
      name: draft.name.trim(),
      role: draft.role,
      pricingPlanId: draft.pricingPlanId,
      phone: phone.ok ? phone.value : null,
      email: draft.email.trim() || null,
      instagram: normalizeInstagram(draft.instagram) || null,
    },
  };
}

// --- namesakes (R10, I-02) --------------------------------------------------

export type Namesake = { entry: RosterEntry; label: string };

// 「示範小雨（老師 @demo_xiaoyu）」 — role, plus IG when there is one.
function describePerson(entry: RosterEntry): string {
  const ig = entry.instagram ? ` @${entry.instagram}` : "";
  return `${entry.name}（${roleToLabel(entry.role)}${ig}）`;
}

// An active person, other than the one being edited, with the same name.
export function findNamesake(name: string, roster: readonly RosterEntry[], selfId?: string): Namesake | null {
  const entry = roster.find((p) => p.id !== selfId && p.archivedAt === null && sameName(p.name, name));
  return entry ? { entry, label: describePerson(entry) } : null;
}

// --- dialog state -----------------------------------------------------------

export type RosterFormState = {
  mode: "create" | "edit";
  id: string | null;
  draft: RosterDraft;
  // What the dialog opened with; isDirty compares against it.
  initial: RosterDraft;
  roleLocked: boolean;
  planLocked: boolean;
  errors: RosterFieldErrors;
};

export type RosterFormAction =
  | { type: "setField"; field: Exclude<RosterField, "role">; value: string }
  | { type: "setRole"; role: RosterRole }
  | { type: "blur"; field: "phone" | "email" | "instagram" }
  | { type: "setErrors"; errors: RosterFieldErrors };

export function initRosterForm(mode: "create" | { edit: RosterEntry }, plans: readonly PricingPlan[]): RosterFormState {
  if (mode === "create") {
    const draft: RosterDraft = {
      name: "",
      role: "teacher",
      pricingPlanId: firstPlanId("teacher", plans),
      phone: "",
      email: "",
      instagram: "",
    };
    return { mode: "create", id: null, draft, initial: draft, roleLocked: false, planLocked: false, errors: {} };
  }
  const entry = mode.edit;
  // The page lists only the roles it manages; anything else is shown as-is.
  const role: RosterRole = isRosterRole(entry.role) ? entry.role : "teacher";
  // A plan archived since leaves the picker empty so a new one must be chosen.
  const planStillOffered = planOptionsFor(role, plans).plans.some((p) => p.id === entry.pricingPlanId);
  const draft: RosterDraft = {
    name: entry.name,
    role,
    pricingPlanId: planStillOffered ? entry.pricingPlanId : "",
    phone: formatPhone(entry.phone),
    email: entry.email,
    instagram: entry.instagram,
  };
  return {
    mode: "edit",
    id: entry.id,
    draft,
    initial: draft,
    roleLocked: true,
    planLocked: role === "guest_teacher",
    errors: {},
  };
}

function withoutError(errors: RosterFieldErrors, field: RosterField): RosterFieldErrors {
  return Object.fromEntries(Object.entries(errors).filter(([key]) => key !== field));
}

function withError(errors: RosterFieldErrors, field: RosterField, message: string | undefined): RosterFieldErrors {
  return message === undefined ? withoutError(errors, field) : { ...errors, [field]: message };
}

export function rosterFormReducer(
  state: RosterFormState,
  action: RosterFormAction,
  plans: readonly PricingPlan[],
): RosterFormState {
  switch (action.type) {
    case "setField":
      return { ...state, draft: { ...state.draft, [action.field]: action.value }, errors: withoutError(state.errors, action.field) };
    case "setRole": {
      // I-06 / R17: fixed once created. S-I01: never remembers the old pick.
      if (state.roleLocked) return state;
      return {
        ...state,
        draft: { ...state.draft, role: action.role, pricingPlanId: firstPlanId(action.role, plans) },
        planLocked: action.role === "guest_teacher",
        errors: withoutError(state.errors, "pricingPlanId"),
      };
    }
    case "blur":
      return blurField(state, action.field);
    case "setErrors":
      return { ...state, errors: action.errors };
  }
}

function blurField(state: RosterFormState, field: "phone" | "email" | "instagram"): RosterFormState {
  const raw = state.draft[field];
  switch (field) {
    case "phone": {
      // I-03: format when valid, keep what was typed when not.
      const phone = normalizePhone(raw);
      return {
        ...state,
        draft: { ...state.draft, phone: phone.ok ? formatPhone(raw) : raw },
        errors: withError(state.errors, "phone", phone.ok ? undefined : phone.reason),
      };
    }
    case "instagram": {
      // I-04: a pasted profile URL or "@handle" becomes the bare handle.
      const handle = normalizeInstagram(raw);
      return {
        ...state,
        draft: { ...state.draft, instagram: handle },
        errors: withError(state.errors, "instagram", instagramError(handle)),
      };
    }
    case "email":
      return { ...state, errors: withError(state.errors, "email", emailError(raw)) };
  }
}

// The field order's first error, for focusing after the server answers.
export function firstErrorField(errors: RosterFieldErrors): RosterField | undefined {
  return ROSTER_FIELD_ORDER.find((field) => errors[field] !== undefined);
}

// S-I02 / I-05: only a real change asks before closing.
export function isDirty(state: RosterFormState): boolean {
  return ROSTER_FIELD_ORDER.some((field) => state.draft[field] !== state.initial[field]);
}
