"use server";

import type { RuleDraft } from "@/server/logic/rental-rule-form";
import { createRules, previewArchiveImpact, previewRuleImpact, setRuleArchived, updateRule } from "@/server/services/rule-writes";
import type { ArchiveImpact, RuleActionResult, RuleOverlapResult, RuleScope } from "@/server/services/rule-writes";

// 租借規則 on the 租借時段 page. Every write refuses to leave an existing
// booking in time that can't be rented (docs/rental-time-rules X2–X3).
const SCOPE: RuleScope = {
  kind: "rental",
  page: "/settings/rules",
  noun: "租借規則",
};

export type RentalRuleActionResult = RuleActionResult;
export type { RuleOverlapResult };

export async function createRentalRules(draft: RuleDraft): Promise<RentalRuleActionResult> {
  return createRules(SCOPE, draft);
}

export async function updateRentalRule(id: string, draft: RuleDraft): Promise<RentalRuleActionResult> {
  return updateRule(SCOPE, id, draft);
}

export async function archiveRentalRule(id: string): Promise<RentalRuleActionResult> {
  return setRuleArchived(SCOPE, id, true);
}

export async function reactivateRentalRule(id: string): Promise<RentalRuleActionResult> {
  return setRuleArchived(SCOPE, id, false);
}

export async function previewRuleOverlaps(draft: RuleDraft, editingId?: string): Promise<RuleOverlapResult> {
  return previewRuleImpact(SCOPE, draft, editingId);
}

export async function previewRuleArchive(id: string, archive: boolean): Promise<ArchiveImpact> {
  return previewArchiveImpact(SCOPE, id, archive);
}
