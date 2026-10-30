import type { Purpose } from "@/server/logic/booking";
import { BOOKING_ROLES, defaultPurposeFor } from "@/server/logic/purpose-rules";
import type { BookingRole, PurposeSetting, RolePricing } from "@/server/logic/purpose-rules";
import type { PricingPlan } from "@/server/logic/pricing";
import { sortPlans } from "@/server/logic/pricing-list";
import { payPercentFromInput } from "@/server/logic/purpose-pricing";
import { formatRates, parseRate } from "@/server/logic/settings-form";
import { purposeToLabel, roleToLabel } from "@/server/supabase/codecs";

// One role card in the edit dialog, as typed (numbers are text until saved).
// mode "plan" = 方案價格, stored as no purpose_role_pricing row.
export type RoleDraft = {
  open: boolean;
  mode: "plan" | "price" | "discount";
  rateA: string;
  rateB: string;
  // 幾折 as typed: "8" = 8 折, "8.5" = 85 折.
  zhe: string;
};

export type PurposeDraft = Record<BookingRole, RoleDraft>;

// roles: the error shown under that role's card.
// E-19: a field-error map is always single-level — each role's price error
// is its own key (`roles.teacher`, ...) instead of a nested roles object.
export type PurposeFieldErrors = { allowedRoles?: string } & Partial<Record<`roles.${BookingRole}`, string>>;

// Only open roles priced by 指定價格／折扣 appear in rolePricing.
export type PurposeChange = { allowedRoles: BookingRole[]; rolePricing: Partial<Record<BookingRole, RolePricing>> };

export type PurposeDraftResult = { ok: true; value: PurposeChange } | { ok: false; fieldErrors: PurposeFieldErrors };

const EMPTY_ROLE_DRAFT: RoleDraft = { open: false, mode: "plan", rateA: "", rateB: "", zhe: "" };

// 80 → "8", 85 → "8.5": the inverse of payPercentFromInput.
function zheInput(payPercent: number): string {
  const value = payPercent / 10;
  return value % 1 === 0 ? String(value) : value.toFixed(1);
}

function roleDraftFor(role: BookingRole, setting: PurposeSetting): RoleDraft {
  const open = setting.allowedRoles.includes(role);
  if (!open) return { ...EMPTY_ROLE_DRAFT };
  const pricing = setting.rolePricing[role];
  if (!pricing) return { ...EMPTY_ROLE_DRAFT, open: true };
  if (pricing.mode === "price") {
    return { open: true, mode: "price", rateA: String(pricing.roomA), rateB: String(pricing.roomB), zhe: "" };
  }
  return { open: true, mode: "discount", rateA: "", rateB: "", zhe: zheInput(pricing.payPercent) };
}

const ROLE_DRAFT_MODES: readonly RoleDraft["mode"][] = ["plan", "price", "discount"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRoleDraft(value: unknown): RoleDraft | null {
  if (!isRecord(value)) return null;
  const { open, mode, rateA, rateB, zhe } = value;
  if (typeof open !== "boolean" || !ROLE_DRAFT_MODES.includes(mode as RoleDraft["mode"])) return null;
  if (typeof rateA !== "string" || typeof rateB !== "string" || typeof zhe !== "string") return null;
  return { open, mode: mode as RoleDraft["mode"], rateA, rateB, zhe };
}

// E07: the server action's input is whatever the request carried. Keeps only
// the three role cards, each with exactly the dialog's fields; null when any
// is missing or the wrong type (e.g. an unknown mode).
export function parsePurposeDraft(input: unknown): PurposeDraft | null {
  if (!isRecord(input)) return null;
  const roles = BOOKING_ROLES.map((role) => [role, parseRoleDraft(input[role])] as const);
  if (roles.some(([, roleDraft]) => roleDraft === null)) return null;
  return Object.fromEntries(roles) as PurposeDraft;
}

// I-01: turning a role off clears its pricing, so reopening it starts at 方案價格.
export function changeRoleDraft(current: RoleDraft, patch: Partial<RoleDraft>): RoleDraft {
  return patch.open === false ? { ...EMPTY_ROLE_DRAFT } : { ...current, ...patch };
}

export function draftFromSetting(setting: PurposeSetting): PurposeDraft {
  return Object.fromEntries(BOOKING_ROLES.map((role) => [role, roleDraftFor(role, setting)])) as PurposeDraft;
}

function roleDraftEqual(a: RoleDraft, b: RoleDraft): boolean {
  return (
    a.open === b.open &&
    a.mode === b.mode &&
    a.rateA.trim() === b.rateA.trim() &&
    a.rateB.trim() === b.rateB.trim() &&
    a.zhe.trim() === b.zhe.trim()
  );
}

export function isPurposeDraftDirty(initial: PurposeDraft, current: PurposeDraft): boolean {
  return BOOKING_ROLES.some((role) => !roleDraftEqual(initial[role], current[role]));
}

// Roles whose pre-selected purpose this is (F-用途-8): 舞蹈 → 老師、客戶.
function rolesDefaultingTo(purpose: Purpose): BookingRole[] {
  return BOOKING_ROLES.filter((r) => defaultPurposeFor(r) === purpose);
}

// T19: which role cards the edit dialog must lock the 開放預約 switch for.
export function defaultRoleLocks(purpose: Purpose): BookingRole[] {
  return rolesDefaultingTo(purpose);
}

// 「老師和客戶」
function joinRoles(roles: readonly BookingRole[]): string {
  const labels = roles.map(roleToLabel);
  return labels.length <= 1 ? labels.join("") : `${labels.slice(0, -1).join("、")}和${labels.at(-1)}`;
}

function defaultPurposePrefix(purpose: Purpose, roles: readonly BookingRole[]): string {
  return `${purposeToLabel(purpose)}是${joinRoles(roles)}的預設用途`;
}

// 用途 B3 / U08 / T04: a role's default purpose can't be archived.
export function archiveConflict(purpose: Purpose): string | null {
  const defaults = rolesDefaultingTo(purpose);
  return defaults.length ? `${defaultPurposePrefix(purpose, defaults)}，不能停用` : null;
}

// I-02: written on a locked role card.
export function defaultRoleLockNote(purpose: Purpose, role: BookingRole): string {
  return `${defaultPurposePrefix(purpose, [role])}，不能關`;
}

// A role's plans as the pricing page lists them, archived ones left out.
function activePlansFor(role: BookingRole, plans: readonly PricingPlan[]): PricingPlan[] {
  return sortPlans(plans).filter((plan) => plan.category === role && plan.archivedAt === null);
}

function planText(plan: PricingPlan): string {
  return `${plan.appliesTo} ${formatRates(plan.roomARate, plan.roomBRate)}`;
}

// I-03: 「照每位老師自己的價格方案（老師價 500／250、專屬價一 450／200）。」
export function rolePlanHint(role: BookingRole, plans: readonly PricingPlan[]): string {
  const listed = activePlansFor(role, plans).map(planText).join("、");
  return `照每位${roleToLabel(role)}自己的價格方案${listed ? `（${listed}）` : ""}。`;
}

// I-04: 「付方案價的 80%。例：老師價 500／250 → 400／200」, using the role's
// first plan; null while 幾折 isn't valid.
export function discountHint(zhe: string, role: BookingRole, plans: readonly PricingPlan[]): string | null {
  const parsed = payPercentFromInput(zhe);
  if (!parsed.ok) return null;
  const [first] = activePlansFor(role, plans);
  const head = `付方案價的 ${parsed.value}%。`;
  if (!first) return head;
  const discounted = (rate: number) => Math.round((rate * parsed.value) / 100);
  return `${head}例：${planText(first)} → ${formatRates(discounted(first.roomARate), discounted(first.roomBRate))}`;
}

// 用途 B3 / U03 / T04 / I-01: nor closed to the roles it is the default for.
export function removedDefaultRolesConflict(purpose: Purpose, allowedRoles: readonly BookingRole[]): string | null {
  const defaults = rolesDefaultingTo(purpose);
  if (defaults.every((r) => allowedRoles.includes(r))) return null;
  return `${defaultPurposePrefix(purpose, defaults)}，不能拿掉${defaults.length > 1 ? "這兩個" : "這個"}身分`;
}

// R08 / T12 / E03: 指定價格 needs both rooms filled, each a valid rate.
function validatePriceRole(draft: RoleDraft): { pricing: RolePricing } | { error: string } {
  const a = draft.rateA.trim();
  const b = draft.rateB.trim();
  if (a === "" && b === "") return { error: "請填 A、B 間價格，或改回『方案價格』" };
  if (a === "" || b === "") return { error: "A、B 要一起填" };
  const roomA = parseRate(a);
  if (!roomA.ok) return { error: roomA.reason };
  const roomB = parseRate(b);
  if (!roomB.ok) return { error: roomB.reason };
  return { pricing: { mode: "price", roomA: roomA.value, roomB: roomB.value } };
}

// R09 / T13 / E04: 折扣 is a single 幾折 field shared by both rooms.
function validateDiscountRole(draft: RoleDraft): { pricing: RolePricing } | { error: string } {
  const parsed = payPercentFromInput(draft.zhe);
  if (!parsed.ok) return { error: parsed.reason };
  return { pricing: { mode: "discount", payPercent: parsed.value } };
}

// U04–U06 / T06–T13 / T29: run by the dialog and again by the server action.
export function validatePurposeDraft(purpose: Purpose, draft: PurposeDraft): PurposeDraftResult {
  const fieldErrors: PurposeFieldErrors = {};

  const allowedRoles = BOOKING_ROLES.filter((role) => draft[role].open);
  if (allowedRoles.length === 0) {
    fieldErrors.allowedRoles = "至少要有一種身分能使用";
  } else {
    const conflict = removedDefaultRolesConflict(purpose, allowedRoles);
    if (conflict) fieldErrors.allowedRoles = conflict;
  }

  const rolePricing: Partial<Record<BookingRole, RolePricing>> = {};
  // E07 / T29: a role that isn't open has its pricing ignored entirely,
  // even if its fields still hold leftover text from before it was closed.
  for (const role of allowedRoles) {
    const roleDraft = draft[role];
    if (roleDraft.mode === "plan") continue;
    const result = roleDraft.mode === "price" ? validatePriceRole(roleDraft) : validateDiscountRole(roleDraft);
    if ("error" in result) fieldErrors[`roles.${role}`] = result.error;
    else rolePricing[role] = result.pricing;
  }

  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true, value: { allowedRoles, rolePricing } };
}
