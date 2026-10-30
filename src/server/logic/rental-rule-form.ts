import { isoWeekday } from "@/server/logic/date";
import type { RentalRule, RuleEffect, RuleInput, RuleKind } from "@/server/logic/booking-rules";
import type { IsoDate } from "@/server/logic/booking";
import { timeRangeError } from "@/server/logic/scheduling-range";

// The 新增／編輯 dialogs of 租借規則 (the 租借時段 page) and 上課時段 (the
// class schedule page): the same fields, except 上課時段 has no 租借 or 原因
// (docs/rental-time-rules/01-ui-design §2).

export type DayMode = "weekly" | "date";
export type Room = "A" | "B";

export type RuleDraft = {
  rooms: Room[];
  mode: DayMode;
  weekdays: number[]; // weekly only; several when adding, exactly one when editing
  onDate: IsoDate | ""; // one day only
  effect: RuleEffect; // "open" only for one day
  start: string;
  end: string;
  reason: string;
};

export type RuleField = "rooms" | "weekdays" | "onDate" | "time" | "reason" | "form";
export type RuleFieldErrors = Partial<Record<RuleField, string>>;

export const EMPTY_RULE_DRAFT: RuleDraft = {
  rooms: ["A"],
  mode: "weekly",
  weekdays: [],
  onDate: "",
  effect: "block",
  start: "",
  end: "",
  reason: "",
};

export const REASON_MAX = 30;
// 上課時段 rows always read this, so a booking blocked by one says 上課時段.
export const CLASS_HOURS_REASON = "上課時段";
export const WEEKLY_OPEN_MESSAGE = "每週的規則只能不可租";
export const DUPLICATE_RULE_MESSAGE = "已經有一樣的租借時段";

// Quick picks next to the weekday buttons.
export const WEEKDAY_SHORTCUTS: ReadonlyArray<{ label: string; weekdays: number[] }> = [
  { label: "平日", weekdays: [1, 2, 3, 4, 5] },
  { label: "週末", weekdays: [6, 7] },
  { label: "每天", weekdays: [1, 2, 3, 4, 5, 6, 7] },
];

export function draftFromRule(rule: RentalRule): RuleDraft {
  return {
    rooms: rule.room === null ? ["A", "B"] : [rule.room],
    mode: rule.onDate === null ? "weekly" : "date",
    weekdays: rule.onDate === null ? [rule.weekday] : [],
    onDate: rule.onDate ?? "",
    effect: rule.effect,
    start: rule.start,
    end: rule.end,
    reason: rule.reason,
  };
}

export type RuleFormAction =
  | { type: "setRooms"; rooms: Room[] }
  | { type: "setMode"; mode: DayMode }
  | { type: "setWeekdays"; weekdays: number[] }
  | { type: "setOnDate"; onDate: IsoDate | "" }
  | { type: "setEffect"; effect: RuleEffect }
  | { type: "setTime"; start: string; end: string }
  | { type: "setReason"; reason: string };

// T09 / I-01: switching 每週固定／只有某一天 clears the other side; 「這天」
// (例外開放) only exists for one day.
export function ruleFormReducer(draft: RuleDraft, action: RuleFormAction): RuleDraft {
  switch (action.type) {
    case "setRooms":
      return { ...draft, rooms: action.rooms };
    case "setMode":
      return action.mode === "weekly"
        ? { ...draft, mode: "weekly", onDate: "", effect: "block" }
        : { ...draft, mode: "date", weekdays: [] };
    case "setWeekdays":
      return { ...draft, weekdays: [...new Set(action.weekdays)].sort((a, b) => a - b) };
    case "setOnDate":
      return { ...draft, onDate: action.onDate };
    case "setEffect":
      return { ...draft, effect: action.effect };
    case "setTime":
      return { ...draft, start: action.start, end: action.end };
    case "setReason":
      return { ...draft, reason: action.reason };
  }
}

const ROOMS: readonly Room[] = ["A", "B"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function isSet<T>(values: readonly T[], allowed: (value: T) => boolean): boolean {
  return values.every(allowed) && new Set(values).size === values.length;
}

// The form can only produce these shapes; a server action called directly
// can send anything, so it checks them before trusting the draft.
function draftShapeError(draft: RuleDraft): string | null {
  const ok =
    typeof draft === "object" &&
    draft !== null &&
    Array.isArray(draft.rooms) &&
    isSet(draft.rooms, (room) => ROOMS.includes(room)) &&
    Array.isArray(draft.weekdays) &&
    isSet(draft.weekdays, (d) => Number.isInteger(d) && d >= 1 && d <= 7) &&
    (draft.mode === "weekly" || draft.mode === "date") &&
    (draft.effect === "block" || draft.effect === "open") &&
    typeof draft.onDate === "string" &&
    (draft.onDate === "" || isRealDate(draft.onDate)) &&
    typeof draft.start === "string" &&
    typeof draft.end === "string" &&
    typeof draft.reason === "string";
  return ok ? null : "資料格式不正確，請重新整理再試一次";
}

// T04–T06: everything the dialog checks before saving; the server action
// checks the same again. 上課時段 has no 原因 to check and is never 可租.
export function validateRuleDraft(
  draft: RuleDraft,
  today: IsoDate,
  purpose: "create" | "edit",
  kind: RuleKind = "rental",
): RuleFieldErrors {
  const shapeError = draftShapeError(draft);
  if (shapeError) return { form: shapeError };

  const errors: RuleFieldErrors = {};
  if (draft.rooms.length === 0) errors.rooms = "請選教室";

  if (draft.mode === "weekly") {
    if (draft.weekdays.length === 0) errors.weekdays = "請選至少一天";
    else if (purpose === "edit" && draft.weekdays.length !== 1) errors.weekdays = "編輯時只能選一天";
    if (draft.effect === "open") errors.form = WEEKLY_OPEN_MESSAGE;
  } else if (!draft.onDate) {
    errors.onDate = "請選日期";
  } else if (draft.onDate < today) {
    errors.onDate = "不能選過去的日期";
  }

  const timeError = timeRangeError(draft.start, draft.end);
  if (timeError) errors.time = timeError;

  if (kind === "class_hours") {
    if (draft.effect === "open") errors.form = "上課時段一定不可租";
    return errors;
  }

  const reason = draft.reason.trim();
  if (!reason) errors.reason = "請填原因";
  else if ([...reason].length > REASON_MAX) errors.reason = `原因最多 ${REASON_MAX} 字`;

  return errors;
}

export function hasRuleErrors(errors: RuleFieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

// T03 / I-02: one row per weekday; both rooms become one BOTH row; a one-day
// row's weekday follows from its date. Assumes a valid draft. 上課時段 is
// always a block with the fixed reason.
export function draftToRows(draft: RuleDraft, kind: RuleKind = "rental"): RuleInput[] {
  const room = draft.rooms.includes("A") && draft.rooms.includes("B") ? null : draft.rooms[0];
  const reason = kind === "class_hours" ? CLASS_HOURS_REASON : draft.reason.trim();
  const common = { kind, room, start: draft.start, end: draft.end, reason };
  if (draft.mode === "date") {
    const effect = kind === "class_hours" ? ("block" as const) : draft.effect;
    return [{ ...common, weekday: isoWeekday(draft.onDate), onDate: draft.onDate, effect }];
  }
  return draft.weekdays.map((weekday) => ({ ...common, weekday, onDate: null, effect: "block" as const }));
}

function sameRule(a: RuleInput, b: RuleInput): boolean {
  return (
    a.kind === b.kind &&
    a.room === b.room &&
    a.weekday === b.weekday &&
    a.onDate === b.onDate &&
    a.start === b.start &&
    a.end === b.end &&
    a.effect === b.effect
  );
}

// Rows saved together must differ from each other too.
export function hasDuplicateInputs(inputs: readonly RuleInput[]): boolean {
  return inputs.some((input, i) => inputs.slice(i + 1).some((other) => sameRule(input, other)));
}

// T08 / I-05 (B4): an active row with the same room, day, time and effect.
// The reason doesn't matter.
export function isDuplicateRule(input: RuleInput, rules: readonly RentalRule[], ignoreId?: string): boolean {
  return rules.some((r) => r.id !== ignoreId && r.archivedAt === null && sameRule(r, input));
}
