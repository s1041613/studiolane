import { describe, expect, it } from "vitest";
import {
  canArchivePlan,
  initPlanForm,
  isPlanFormDirty,
  planFormReducer,
  planInUseMessage,
  rateChangeSummary,
  rateChanges,
  roleOptions,
  validatePlanDraft,
} from "@/server/logic/pricing-form";
import type { PlanDraft } from "@/server/logic/pricing-form";
import { planUsage } from "@/server/logic/pricing-list";
import {
  ARCHIVED_AT,
  GENERAL,
  SEED_PLANS,
  STAFF_PLAN,
  TEACHER_PLAN,
  AXING_PLAN,
  person,
  plan,
} from "@/server/logic/__fixtures__/pricing-plans";

function draft(overrides: Partial<PlanDraft> = {}): PlanDraft {
  return { name: "資深老師價", role: "teacher", roomARate: "800", roomBRate: "330", ...overrides };
}

const TWENTY_ONE_TEACHERS = Array.from({ length: 21 }, (_, i) => person(i < 3 ? ["示範小雨", "示範小橘", "示範小月"][i] : `老師${i}`, "teacher"));

describe("validatePlanDraft", () => {
  it("P04 / T04: accepts a new teacher plan and returns whole-number rates", () => {
    expect(validatePlanDraft(draft(), SEED_PLANS, null)).toEqual({
      ok: true,
      plan: { name: "資深老師價", role: "teacher", roomARate: 800, roomBRate: 330 },
    });
  });

  it("T04: the name is 1–20 characters after trimming", () => {
    expect(validatePlanDraft(draft({ name: "   " }), SEED_PLANS, null)).toEqual({
      ok: false,
      errors: { name: "請填方案名稱" },
    });
    expect(validatePlanDraft(draft({ name: "價".repeat(21) }), SEED_PLANS, null)).toEqual({
      ok: false,
      errors: { name: "方案名稱最多 20 字" },
    });
    const twenty = validatePlanDraft(draft({ name: ` ${"價".repeat(20)} ` }), SEED_PLANS, null);
    expect(twenty.ok && twenty.plan.name).toBe("價".repeat(20));
  });

  it("P06 / T06: an active plan's name is taken, ignoring case and spaces", () => {
    expect(validatePlanDraft(draft({ name: " 老師價 " }), SEED_PLANS, null)).toEqual({
      ok: false,
      errors: { name: "已有「老師價」，請換一個名稱" },
    });
  });

  it("T06: an archived plan's name is free again", () => {
    const old = { ...plan("old", "teacher", "舊老師價", 800, 300), archivedAt: ARCHIVED_AT };
    expect(validatePlanDraft(draft({ name: "舊老師價" }), [...SEED_PLANS, old], null).ok).toBe(true);
  });

  it("T06: editing a plan may keep its own name", () => {
    expect(validatePlanDraft(draft({ name: "老師價" }), SEED_PLANS, TEACHER_PLAN.id).ok).toBe(true);
    expect(validatePlanDraft(draft({ name: "櫃檯價" }), SEED_PLANS, TEACHER_PLAN.id).ok).toBe(false);
  });

  it.each(["84.5", "100000", "-1", ""])("P07 / T07: rejects the rate %j", (rate) => {
    expect(validatePlanDraft(draft({ roomARate: rate }), SEED_PLANS, null)).toEqual({
      ok: false,
      errors: { roomARate: "請填 0 到 99,999 的整數" },
    });
  });

  it.each([
    ["0", 0],
    ["99,999", 99_999],
  ])("P07 / T07: accepts the rate %j", (rate, value) => {
    const result = validatePlanDraft(draft({ roomBRate: rate }), SEED_PLANS, null);
    expect(result.ok && result.plan.roomBRate).toBe(value);
  });

  it("B4: a new plan is a teacher or staff plan, even with no customer plan yet", () => {
    const withoutCustomer = SEED_PLANS.filter((p) => p.category !== "customer");
    expect(validatePlanDraft(draft({ role: "customer" }), withoutCustomer, null)).toEqual({
      ok: false,
      errors: { role: "客戶方案只能有一個" },
    });
    // A forged request can send any string as the role.
    const forged = { ...draft(), role: "guest_teacher" } as unknown as PlanDraft;
    expect(validatePlanDraft(forged, SEED_PLANS, null)).toEqual({ ok: false, errors: { role: "請選老師或櫃檯" } });
  });

  it("P05: a second customer plan is refused", () => {
    expect(validatePlanDraft(draft({ role: "customer" }), SEED_PLANS, null)).toEqual({
      ok: false,
      errors: { role: "客戶方案只能有一個" },
    });
  });
});

describe("roleOptions", () => {
  it("P05 / T05: 客戶 is always disabled for a new plan", () => {
    expect(roleOptions()).toEqual([
      { value: "teacher", label: "老師" },
      { value: "staff", label: "櫃檯" },
      { value: "customer", label: "客戶", disabled: true },
    ]);
  });
});

describe("initPlanForm", () => {
  it("T08: a new plan starts as a teacher plan with empty fields", () => {
    const form = initPlanForm("create");
    expect(form.draft).toEqual({ name: "", role: "teacher", roomARate: "", roomBRate: "" });
    expect(form.roleLocked).toBe(false);
    expect(form.editingId).toBeNull();
  });

  it("P08 / T09: editing locks the role and fills in the plan", () => {
    const form = initPlanForm({ edit: GENERAL });
    expect(form.draft).toEqual({ name: "一般價", role: "customer", roomARate: "1,250", roomBRate: "610" });
    expect(form.roleLocked).toBe(true);
    expect(form.editingId).toBe("general");
  });

  it("T09: a locked role ignores setRole", () => {
    const form = planFormReducer(initPlanForm({ edit: TEACHER_PLAN }), { type: "setRole", value: "staff" });
    expect(form.draft.role).toBe("teacher");
  });
});

describe("planFormReducer", () => {
  it("I-02: formats a valid rate with thousands separators on blur and leaves bad input alone", () => {
    let form = planFormReducer(initPlanForm("create"), { type: "setRate", room: "A", value: "1250" });
    form = planFormReducer(form, { type: "formatRate", room: "A" });
    expect(form.draft.roomARate).toBe("1,250");
    form = planFormReducer(form, { type: "setRate", room: "B", value: "84.5" });
    form = planFormReducer(form, { type: "formatRate", room: "B" });
    expect(form.draft.roomBRate).toBe("84.5");
  });

  it("clears a field's error once it is edited", () => {
    let form = planFormReducer(initPlanForm("create"), { type: "serverErrors", errors: { name: "請填方案名稱" } });
    expect(form.errors.name).toBe("請填方案名稱");
    form = planFormReducer(form, { type: "setName", value: "新方案" });
    expect(form.errors.name).toBeUndefined();
  });

  it("I-06: dirty once something differs from what it opened with", () => {
    const form = initPlanForm({ edit: TEACHER_PLAN });
    expect(isPlanFormDirty(form)).toBe(false);
    expect(isPlanFormDirty(planFormReducer(form, { type: "setRate", room: "A", value: "500" }))).toBe(false);
    expect(isPlanFormDirty(planFormReducer(form, { type: "setName", value: "一般老師價" }))).toBe(true);
  });
});

describe("rate changes", () => {
  it("P09 / T10: renaming only changes no rate", () => {
    const changes = rateChanges(TEACHER_PLAN, draft({ name: "一般老師價", roomARate: "500", roomBRate: "250" }));
    expect(changes).toEqual([]);
  });

  it("P10 / T11: A 500 → 900 is summarised before saving", () => {
    const changes = rateChanges(TEACHER_PLAN, draft({ roomARate: "900", roomBRate: "250" }));
    expect(changes).toEqual([{ room: "A", from: 500, to: 900 }]);
    expect(rateChangeSummary(changes, TEACHER_PLAN, planUsage(TEACHER_PLAN, TWENTY_ONE_TEACHERS))).toBe(
      "A 間 500 → 900，影響 21 位老師之後的新預約。",
    );
  });

  it("T11: both rooms, the customer plan and staff plans word the audience their own way", () => {
    const both = rateChanges(GENERAL, draft({ roomARate: "1,600", roomBRate: "650" }));
    expect(both).toEqual([
      { room: "A", from: 1250, to: 1600 },
      { room: "B", from: 610, to: 650 },
    ]);
    const guests = [person("示範薄荷", "general", { role: "guest_teacher" })];
    expect(rateChangeSummary(both, GENERAL, planUsage(GENERAL, guests))).toBe(
      "A 間 1,250 → 1,600、B 間 610 → 650，影響客戶與 1 位外部老師之後的新預約。",
    );
    const staff = [person("demo_kiki", "staff", { role: "staff" })];
    const staffChange = rateChanges(STAFF_PLAN, draft({ roomARate: "0", roomBRate: "100" }));
    expect(rateChangeSummary(staffChange, STAFF_PLAN, planUsage(STAFF_PLAN, staff))).toBe(
      "B 間 0 → 100，影響 1 位櫃檯之後的新預約。",
    );
  });

  it("a rate that doesn't parse yet is not a change", () => {
    expect(rateChanges(TEACHER_PLAN, draft({ roomARate: "9x", roomBRate: "250" }))).toEqual([]);
  });
});

describe("canArchivePlan", () => {
  it("P14 / T16: nobody active on it → ok", () => {
    const senior = plan("senior", "teacher", "資深老師價", 800, 330);
    expect(canArchivePlan(senior, TWENTY_ONE_TEACHERS)).toEqual({ ok: true });
  });

  it("P15 / T17: people still on it → blocked, with their names", () => {
    const result = canArchivePlan(TEACHER_PLAN, TWENTY_ONE_TEACHERS);
    expect(result.ok).toBe(false);
    if (result.ok || result.reason !== "in_use") throw new Error("expected in_use");
    expect(result.people).toHaveLength(21);
    expect(planInUseMessage(TEACHER_PLAN, result.people)).toBe(
      "老師價還有 21 位人員在用：示範小雨、示範小橘、示範小月、老師3、老師4…。請先到人員名單幫他們換方案。",
    );
  });

  it("T17: a short list has no ellipsis", () => {
    expect(planInUseMessage(AXING_PLAN, [person("示範阿星", "demo_star")])).toBe(
      "專屬價一還有 1 位人員在用：示範阿星。請先到人員名單幫他們換方案。",
    );
  });

  it("P16 / T18: only archived people on it → ok", () => {
    const old = plan("old", "teacher", "舊老師價", 800, 300);
    expect(canArchivePlan(old, [person("示範小鹿", "old", { archivedAt: ARCHIVED_AT })])).toEqual({ ok: true });
  });

  it("P17: the customer plan can't be archived", () => {
    expect(canArchivePlan(GENERAL, [])).toEqual({ ok: false, reason: "customer" });
  });
});
