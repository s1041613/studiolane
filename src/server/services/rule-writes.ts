import { fail, failBlockers, failFields, ok } from "@/lib/result";
import type { Outcome, Sealed } from "@/lib/result";
import { runAction } from "@/server/boundary/run-action";
import { todayIso } from "@/server/logic/date";
import {
  DUPLICATE_RULE_MESSAGE,
  draftToRows,
  hasDuplicateInputs,
  hasRuleErrors,
  isDuplicateRule,
  validateRuleDraft,
} from "@/server/logic/rental-rule-form";
import type { RuleFieldErrors } from "@/server/logic/rental-rule-form";
import { parseRuleDraft } from "@/server/logic/rule-draft-schema";
import { brokenRentalsMessage, rentalsBrokenBy } from "@/server/logic/rule-impact";
import type { RentalRule, RuleInput, RuleKind } from "@/server/logic/booking-rules";
import { RulesRepository } from "@/server/repositories/rules-repository";
import { RentalRepository } from "@/server/repositories/rental-repository";
import type { RentalSummary } from "@/server/types/home";

// The writes behind 租借規則 (/settings/rules). Another kind of rule (its
// own admin page, not built yet) may share this seam one day, so RuleScope
// stays generic over `kind`; for now every write below only has to handle
// kind "rental".

// Bookings a change would leave in time that can't be rented.
export type RuleBlockers = { conflicts: RentalSummary[] };

// Success carries the sentence the page shows.
type RuleReactions = { fields: RuleFieldErrors; blockers: RuleBlockers };
type RuleOutcome = Outcome<string, RuleReactions>;
export type RuleActionResult = Sealed<string, RuleReactions>;

// The bookings a draft would break, asked while the dialog is open.
export type RuleOverlapResult = Sealed<RentalSummary[]>;

export type RuleScope = {
  kind: RuleKind;
  page: string;
  noun: string;
};

const rulesRepo = new RulesRepository();
const rentalRepo = new RentalRepository();

// Rules decide the booking form's free time.
const REVALIDATE = ["/settings/rules", "/bookings/new"];

function notFound(scope: RuleScope): string {
  return `找不到這筆${scope.noun}，請重新整理`;
}

// Everything a change must not break, checked against fresh data on the
// server: existing bookings.
async function guard(before: RentalRule[], after: RentalRule[], action: "存" | "停用" | "啟用"): Promise<RuleOutcome | null> {
  const conflicts = rentalsBrokenBy(before, after, await rentalRepo.listAll(), new Date());
  if (conflicts.length === 0) return null;
  return failBlockers("FAILED_PRECONDITION", brokenRentalsMessage(conflicts.length, action), { conflicts });
}

function withNewRows(rules: RentalRule[], inputs: readonly RuleInput[]): RentalRule[] {
  return [...rules, ...inputs.map((input, i) => ({ ...input, id: `new-${i}`, archivedAt: null }))];
}

// Every write runs through runAction directly: no audit seam here, the
// repository call below is the only place state changes. Pages are
// revalidated only after it resolves.
function write(scope: RuleScope, attempted: string, run: (updatedBy: string) => Promise<RuleOutcome>): Promise<RuleActionResult> {
  return runAction(
    { attempted: `${attempted}${scope.noun}`, access: { adminPage: scope.page }, effect: "write", revalidate: REVALIDATE },
    (actor) => run(actor.name),
  );
}

// `input` is whatever the action received at the wire, not yet trusted as a
// RuleDraft; parseRuleDraft (rule-draft-schema.ts) is the first check.
export async function createRules(scope: RuleScope, input: unknown): Promise<RuleActionResult> {
  return write(scope, "新增", async (updatedBy) => {
    const parsed = parseRuleDraft(input);
    if (!parsed.ok) return failFields(parsed.errors);

    const fieldErrors = validateRuleDraft(parsed.draft, todayIso(), "create", scope.kind);
    if (hasRuleErrors(fieldErrors)) return failFields(fieldErrors);

    const rules = await rulesRepo.listAll();
    const inputs = draftToRows(parsed.draft, scope.kind);
    if (hasDuplicateInputs(inputs) || inputs.some((row) => isDuplicateRule(row, rules))) {
      return fail("ALREADY_EXISTS", DUPLICATE_RULE_MESSAGE);
    }
    const blocked = await guard(rules, withNewRows(rules, inputs), "存");
    if (blocked) return blocked;

    await rulesRepo.create(inputs, updatedBy);
    return ok(`已新增 ${inputs.length} 筆${scope.noun}`);
  });
}

export async function updateRule(scope: RuleScope, id: string, input: unknown): Promise<RuleActionResult> {
  return write(scope, "修改", async (updatedBy) => {
    const rules = await rulesRepo.listAll();
    const current = rules.find((r) => r.id === id && r.kind === scope.kind);
    if (!current) return fail("NOT_FOUND", notFound(scope));

    const parsed = parseRuleDraft(input);
    if (!parsed.ok) return failFields(parsed.errors);

    const fieldErrors = validateRuleDraft(parsed.draft, todayIso(), "edit", scope.kind);
    if (hasRuleErrors(fieldErrors)) return failFields(fieldErrors);

    const [row] = draftToRows(parsed.draft, scope.kind);
    if (isDuplicateRule(row, rules, id)) return fail("ALREADY_EXISTS", DUPLICATE_RULE_MESSAGE);

    const blocked = await guard(rules, rules.map((r) => (r.id === id ? { ...r, ...row } : r)), "存");
    if (blocked) return blocked;

    await rulesRepo.update(id, row, updatedBy);
    return ok("已儲存");
  });
}

export async function setRuleArchived(scope: RuleScope, id: string, archive: boolean): Promise<RuleActionResult> {
  const verb = archive ? "停用" : "啟用";
  return write(scope, verb, async (updatedBy) => {
    const rules = await rulesRepo.listAll();
    const current = rules.find((r) => r.id === id && r.kind === scope.kind);
    if (!current) return fail("NOT_FOUND", notFound(scope));
    if (!archive && isDuplicateRule(current, rules, id)) return fail("ALREADY_EXISTS", DUPLICATE_RULE_MESSAGE);

    const archivedAt = archive ? new Date().toISOString() : null;
    const after = rules.map((r) => (r.id === id ? { ...r, archivedAt } : r));
    const blocked = await guard(rules, after, verb);
    if (blocked) return blocked;

    await rulesRepo.setArchived(id, archivedAt, updatedBy);
    return ok(verb === "停用" ? "已停用" : "已啟用");
  });
}

export type ArchiveImpact = Sealed<{ rentals: RentalSummary[] }>;

// Before the 停用／啟用 confirmation, find out whether the change would
// break bookings. If so the page shows a NoticeDialog with the list instead
// of the confirmation. Read-only, so not wrapped in `write`.
export async function previewArchiveImpact(scope: RuleScope, id: string, archive: boolean): Promise<ArchiveImpact> {
  return runAction({ attempted: `檢查停用${scope.noun}`, access: { adminPage: scope.page }, effect: "read" }, async () => {
    const rules = await rulesRepo.listAll();
    if (!rules.some((r) => r.id === id && r.kind === scope.kind)) return fail("NOT_FOUND", notFound(scope));
    const archivedAt = archive ? new Date().toISOString() : null;
    const after = rules.map((r) => (r.id === id ? { ...r, archivedAt } : r));
    return ok({ rentals: rentalsBrokenBy(rules, after, await rentalRepo.listAll(), new Date()) });
  });
}

// Read-only: the dialog asks on every change with what is filled in so far
// and lists the bookings that would block the save; `editingId` is the row
// being edited, if any. A malformed draft (still being typed) simply
// previews no overlaps rather than failing — saving checks it for real.
export async function previewRuleImpact(scope: RuleScope, input: unknown, editingId?: string): Promise<RuleOverlapResult> {
  return runAction({ attempted: `檢查${scope.noun}影響`, access: { adminPage: scope.page }, effect: "read" }, async () => {
    const parsed = parseRuleDraft(input);
    if (!parsed.ok) return ok([]);
    const { rooms, weekdays, onDate, time, form } = validateRuleDraft(parsed.draft, todayIso(), editingId ? "edit" : "create", scope.kind);
    if (rooms || weekdays || onDate || time || form) return ok([]);
    const rules = await rulesRepo.listAll();
    const inputs = draftToRows(parsed.draft, scope.kind);
    const after = editingId
      ? rules.map((r) => (r.id === editingId ? { ...r, ...inputs[0] } : r))
      : withNewRows(rules, inputs);
    return ok(rentalsBrokenBy(rules, after, await rentalRepo.listAll(), new Date()));
  });
}
