import { z } from "zod";
import type { RuleDraft, RuleField, RuleFieldErrors } from "@/server/logic/rental-rule-form";

// The runtime shape a RuleDraft must have before any business rule in
// validateRuleDraft is worth checking. The dialog only ever submits one of
// a few shapes; a server action called directly, or a stale client after a
// deploy, can send anything. This is the action's own front door: it runs
// before validateRuleDraft and never throws, so a malformed request always
// comes back as field errors the screen already knows how to show.

const ROOM = z.enum(["A", "B"]);
const WEEKDAY = z.number().int().min(1).max(7);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function distinct<T>(values: readonly T[]): boolean {
  return new Set(values).size === values.length;
}

export const ruleDraftSchema = z
  .object({
    rooms: z.array(ROOM).min(1, "請選教室").refine(distinct, "請選教室"),
    mode: z.enum(["weekly", "date"]),
    weekdays: z.array(WEEKDAY).refine(distinct, "請選至少一天"),
    onDate: z.union([z.literal(""), z.string().regex(ISO_DATE, "日期格式不正確")]),
    effect: z.enum(["block", "open"]),
    start: z.string(),
    end: z.string(),
    reason: z.string(),
  })
  // Only the ordering is checked here — format and the 10-minute step still
  // belong to timeRangeError, run inside validateRuleDraft once the shape
  // is trusted.
  .superRefine((draft, ctx) => {
    if (draft.start && draft.end && draft.start >= draft.end) {
      ctx.addIssue({ code: "custom", path: ["end"], message: "結束要晚於開始" });
    }
  });

// `ruleDraftSchema`'s output must stay assignable to RuleDraft; a mismatch
// here is a compile error, not a runtime one.
type _AssertShape = z.infer<typeof ruleDraftSchema> extends RuleDraft ? true : never;
const _assertShape: _AssertShape = true;
void _assertShape;

const FIELD_FOR_PATH: Record<string, RuleField> = {
  rooms: "rooms",
  weekdays: "weekdays",
  onDate: "onDate",
  start: "time",
  end: "time",
  reason: "reason",
};

// Matches draftShapeError's own wording for the same situation: the value
// isn't shaped like a RuleDraft at all.
const SHAPE_ERROR_MESSAGE = "資料格式不正確，請重新整理再試一次";

function fieldErrorsFromIssues(issues: readonly z.core.$ZodIssue[]): RuleFieldErrors {
  const errors: RuleFieldErrors = {};
  for (const issue of issues) {
    // A root-level issue (not an object at all) has no path; zod's own
    // message for that is in English, so it's replaced with the shape
    // message rather than shown as is.
    if (issue.path.length === 0) {
      errors.form = SHAPE_ERROR_MESSAGE;
      continue;
    }
    const key = issue.path[0];
    const field: RuleField = (typeof key === "string" && FIELD_FOR_PATH[key]) || "form";
    if (errors[field] === undefined) errors[field] = issue.message;
  }
  if (Object.keys(errors).length === 0) errors.form = SHAPE_ERROR_MESSAGE;
  return errors;
}

export type RuleDraftParse = { ok: true; draft: RuleDraft } | { ok: false; errors: RuleFieldErrors };

// The action's entry point for an incoming draft: never throws, always
// resolves to either a trustworthy RuleDraft or the field errors to show.
export function parseRuleDraft(input: unknown): RuleDraftParse {
  const result = ruleDraftSchema.safeParse(input);
  if (result.success) return { ok: true, draft: result.data };
  return { ok: false, errors: fieldErrorsFromIssues(result.error.issues) };
}
