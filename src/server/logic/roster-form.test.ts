import { describe, expect, it } from "vitest";
import {
  findNamesake,
  firstErrorField,
  formatPhone,
  initRosterForm,
  isDirty,
  needsPlanOnReactivate,
  normalizePhone,
  planOptionLabel,
  planOptionsFor,
  rosterFormReducer,
  validateRosterDraft,
} from "@/server/logic/roster-form";
import type { RosterDraft, RosterFormState } from "@/server/logic/roster-form";
import type { PricingPlan, RosterEntry } from "@/server/logic/pricing";

function plan(id: string, category: PricingPlan["category"], appliesTo: string, a: number, b: number, archived = false): PricingPlan {
  return { id, category, appliesTo, roomARate: a, roomBRate: b, archivedAt: archived ? "2026-10-01T00:00:00Z" : null };
}

const GENERAL = plan("plan-general", "customer", "一般價", 1250, 600);
const TEACHER_PLAN = plan("plan-teacher", "teacher", "老師價", 500, 250);
const AXING = plan("plan-demo_star", "teacher", "專屬價一", 450, 200);
const OLD_TEACHER = plan("plan-old-teacher", "teacher", "舊老師價", 800, 300, true);
const STAFF_PLAN = plan("plan-staff", "staff", "櫃檯價", 0, 0);
// Listed out of display order on purpose: the form must pick by name order.
const PLANS = [STAFF_PLAN, AXING, OLD_TEACHER, GENERAL, TEACHER_PLAN];

function person(name: string, extra: Partial<RosterEntry> = {}): RosterEntry {
  return {
    id: `id-${name}`,
    name,
    email: "",
    phone: "",
    role: "teacher",
    pricingPlanId: TEACHER_PLAN.id,
    instagram: "",
    archivedAt: null,
    ...extra,
  };
}

const XIAOYU = person("示範小雨", { instagram: "demo_xiaoyu", phone: "0912345678", email: "xy@example.com" });

function draft(overrides: Partial<RosterDraft> = {}): RosterDraft {
  return {
    name: "示範小藍",
    role: "teacher",
    pricingPlanId: TEACHER_PLAN.id,
    phone: "",
    email: "",
    instagram: "",
    ...overrides,
  };
}

function apply(state: RosterFormState, ...actions: Parameters<typeof rosterFormReducer>[1][]): RosterFormState {
  return actions.reduce((s, a) => rosterFormReducer(s, a, PLANS), state);
}

describe("initRosterForm", () => {
  it("R07 / T06: a new person defaults to 老師 on the first active teacher plan", () => {
    const state = initRosterForm("create", PLANS);
    expect(state.draft.role).toBe("teacher");
    expect(state.draft.pricingPlanId).toBe(TEACHER_PLAN.id);
    expect(state.roleLocked).toBe(false);
    expect(state.planLocked).toBe(false);
  });

  it("R17 / T22: editing locks the role and fills in the current values", () => {
    const state = initRosterForm({ edit: XIAOYU }, PLANS);
    expect(state.roleLocked).toBe(true);
    expect(state.id).toBe(XIAOYU.id);
    expect(state.draft).toEqual({
      name: "示範小雨",
      role: "teacher",
      pricingPlanId: TEACHER_PLAN.id,
      phone: "0912-345-678", // gitleaks:allow
      email: "xy@example.com",
      instagram: "demo_xiaoyu",
    });
  });
});

describe("initRosterForm with an archived plan", () => {
  it("editing someone whose plan was archived starts with no plan picked", () => {
    const state = initRosterForm({ edit: person("老面孔", { pricingPlanId: OLD_TEACHER.id }) }, PLANS);
    expect(state.draft.pricingPlanId).toBe("");
    expect(validateRosterDraft(state.draft, PLANS)).toMatchObject({ errors: { pricingPlanId: "請選價格方案" } });
  });
});

describe("firstErrorField", () => {
  it("I-11 style: picks the topmost field with an error", () => {
    expect(firstErrorField({ instagram: "x", phone: "y" })).toBe("phone");
    expect(firstErrorField({})).toBeUndefined();
  });
});

describe("rosterFormReducer", () => {
  it("R08 / S-I01 / T07: switching role picks that role's first plan and forgets the old pick", () => {
    const start = apply(initRosterForm("create", PLANS), { type: "setField", field: "pricingPlanId", value: AXING.id });
    const staff = apply(start, { type: "setRole", role: "staff" });
    expect(staff.draft.pricingPlanId).toBe(STAFF_PLAN.id);
    const back = apply(staff, { type: "setRole", role: "teacher" });
    expect(back.draft.pricingPlanId).toBe(TEACHER_PLAN.id);
  });

  it("R09 / T08: guest teachers are pinned to the customer plan", () => {
    const state = apply(initRosterForm("create", PLANS), { type: "setRole", role: "guest_teacher" });
    expect(state.draft.pricingPlanId).toBe(GENERAL.id);
    expect(state.planLocked).toBe(true);
    expect(apply(state, { type: "setRole", role: "teacher" }).planLocked).toBe(false);
  });

  it("T22: a locked role can't be changed", () => {
    const state = apply(initRosterForm({ edit: XIAOYU }, PLANS), { type: "setRole", role: "staff" });
    expect(state.draft.role).toBe("teacher");
    expect(state.draft.pricingPlanId).toBe(TEACHER_PLAN.id);
  });

  it("R13 / I-03: phone blur formats a valid number", () => {
    const state = apply(
      initRosterForm("create", PLANS),
      { type: "setField", field: "phone", value: "0912 345 678" }, // gitleaks:allow
      { type: "blur", field: "phone" },
    );
    expect(state.draft.phone).toBe("0912-345-678"); // gitleaks:allow
    expect(state.errors.phone).toBeUndefined();
  });

  it("R12 / I-03: phone blur keeps an invalid number as typed and shows the error", () => {
    const state = apply(
      initRosterForm("create", PLANS),
      { type: "setField", field: "phone", value: "0912-34567" },
      { type: "blur", field: "phone" },
    );
    expect(state.draft.phone).toBe("0912-34567");
    expect(state.errors.phone).toBe("手機是 09 開頭共 10 碼，例：0912-345-678"); // gitleaks:allow
  });

  it("R14 / I-04 / T15 / T21: IG blur keeps only the handle from a pasted URL", () => {
    const state = apply(
      initRosterForm("create", PLANS),
      { type: "setField", field: "instagram", value: "https://www.instagram.com/demo_mint?igsh=abc" }, // gitleaks:allow
      { type: "blur", field: "instagram" },
    );
    expect(state.draft.instagram).toBe("demo_mint");
    expect(state.errors.instagram).toBeUndefined();
  });

  it("R14 / T15: IG blur flags a handle with spaces", () => {
    const state = apply(
      initRosterForm("create", PLANS),
      { type: "setField", field: "instagram", value: "demo qing" },
      { type: "blur", field: "instagram" },
    );
    expect(state.errors.instagram).toBe("IG 帳號只能有英文、數字、. 和 _，最多 30 字");
  });

  it("R15: email blur flags a malformed address", () => {
    const state = apply(
      initRosterForm("create", PLANS),
      { type: "setField", field: "email", value: "abc@" },
      { type: "blur", field: "email" },
    );
    expect(state.errors.email).toBe("Email 格式不正確");
  });

  it("typing in a field clears its error", () => {
    const state = apply(
      initRosterForm("create", PLANS),
      { type: "setErrors", errors: { name: "請填名字" } },
      { type: "setField", field: "name", value: "小" },
    );
    expect(state.errors.name).toBeUndefined();
  });
});

describe("normalizePhone / formatPhone", () => {
  it("R12 / T12: rejects too few digits and landlines", () => {
    expect(normalizePhone("0912-34567").ok).toBe(false);
    expect(normalizePhone("02-2345-6789").ok).toBe(false); // gitleaks:allow
  });

  it("R13 / T13: strips separators to digits and formats them back", () => {
    expect(normalizePhone("0912 345 678")).toEqual({ ok: true, value: "0912345678" }); // gitleaks:allow
    expect(formatPhone("0912345678")).toBe("0912-345-678"); // gitleaks:allow
  });

  it("T14: blank is allowed and stored as null", () => {
    expect(normalizePhone("  ")).toEqual({ ok: true, value: null });
    expect(formatPhone("")).toBe("");
  });
});

describe("validateRosterDraft", () => {
  it("R13 / T14: a valid draft is normalized for the DB", () => {
    const result = validateRosterDraft(
      draft({ name: " 示範小藍 ", phone: "0912 345 678", email: " a@example.com ", instagram: "@demo_blue" }), // gitleaks:allow
      PLANS,
    );
    expect(result).toEqual({
      ok: true,
      value: {
        name: "示範小藍",
        role: "teacher",
        pricingPlanId: TEACHER_PLAN.id,
        phone: "0912345678",
        email: "a@example.com",
        instagram: "demo_blue",
      },
    });
  });

  it("T14 / T16: blank optional fields become null", () => {
    const result = validateRosterDraft(draft(), PLANS);
    expect(result.ok && result.value).toMatchObject({ phone: null, email: null, instagram: null });
  });

  it("R11 / T11: name is required and at most 30 characters", () => {
    expect(validateRosterDraft(draft({ name: "   " }), PLANS)).toMatchObject({ ok: false, errors: { name: "請填名字" } });
    expect(validateRosterDraft(draft({ name: "字".repeat(31) }), PLANS)).toMatchObject({
      ok: false,
      errors: { name: "名字最多 30 字" },
    });
    expect(validateRosterDraft(draft({ name: "字".repeat(30) }), PLANS).ok).toBe(true);
  });

  it("R15 / T16: email must look like x@y.z", () => {
    expect(validateRosterDraft(draft({ email: "abc@" }), PLANS)).toMatchObject({
      ok: false,
      errors: { email: "Email 格式不正確" },
    });
  });

  it("T17: reports every error at once and points at the topmost field", () => {
    const result = validateRosterDraft(draft({ name: "", phone: "123", email: "abc@", instagram: "demo qing" }), PLANS);
    expect(result).toMatchObject({
      ok: false,
      firstErrorField: "name",
      errors: {
        name: "請填名字",
        phone: "手機是 09 開頭共 10 碼，例：0912-345-678", // gitleaks:allow
        email: "Email 格式不正確",
        instagram: "IG 帳號只能有英文、數字、. 和 _，最多 30 字",
      },
    });
    expect(validateRosterDraft(draft({ phone: "123", email: "abc@" }), PLANS)).toMatchObject({ firstErrorField: "phone" });
  });

  it("B2: the plan must exist, fit the role and be active", () => {
    expect(validateRosterDraft(draft({ pricingPlanId: "" }), PLANS)).toMatchObject({
      errors: { pricingPlanId: "請選價格方案" },
    });
    expect(validateRosterDraft(draft({ pricingPlanId: STAFF_PLAN.id }), PLANS)).toMatchObject({
      errors: { pricingPlanId: "這個價格方案不適用老師" },
    });
    expect(validateRosterDraft(draft({ role: "guest_teacher", pricingPlanId: TEACHER_PLAN.id }), PLANS)).toMatchObject({
      errors: { pricingPlanId: "這個價格方案不適用外部老師" },
    });
    expect(validateRosterDraft(draft({ pricingPlanId: OLD_TEACHER.id }), PLANS)).toMatchObject({
      errors: { pricingPlanId: "這個價格方案已停用，請改選" },
    });
  });

  it("B2: an archived plan is refused even when it is the person's current one", () => {
    expect(validateRosterDraft(draft({ pricingPlanId: OLD_TEACHER.id }), PLANS)).toMatchObject({
      errors: { pricingPlanId: "這個價格方案已停用，請改選" },
    });
  });

  it("rejects a role the page does not manage", () => {
    expect(validateRosterDraft(draft({ role: "customer" as RosterDraft["role"] }), PLANS)).toMatchObject({
      errors: { role: "請選身分" },
    });
  });
});

describe("planOptionsFor", () => {
  it("I-01: lists the role's active plans in name order", () => {
    expect(planOptionsFor("teacher", PLANS).plans).toEqual([TEACHER_PLAN, AXING]);
    expect(planOptionsFor("staff", PLANS).plans).toEqual([STAFF_PLAN]);
    expect(planOptionsFor("guest_teacher", PLANS)).toMatchObject({ plans: [GENERAL], locked: true });
  });

  it("never offers an archived plan", () => {
    expect(planOptionsFor("teacher", PLANS).plans).not.toContain(OLD_TEACHER);
  });

  it("R16 / T18: no active plan → empty list, message, and the form can't be submitted", () => {
    const options = planOptionsFor("staff", [TEACHER_PLAN, { ...STAFF_PLAN, archivedAt: "2026-10-01T00:00:00Z" }]);
    expect(options).toEqual({
      plans: [],
      locked: false,
      emptyMessage: "沒有適用櫃檯的價格方案，請先到價格方案新增",
      canSubmit: false,
    });
    expect(planOptionsFor("staff", PLANS)).toMatchObject({ emptyMessage: null, canSubmit: true });
  });
});

describe("planOptionLabel", () => {
  it("S-I03 / T20: shows the name with both hourly rates", () => {
    expect(planOptionLabel(TEACHER_PLAN)).toBe("老師價 — A 500 / B 250 每小時");
    expect(planOptionLabel(GENERAL)).toBe("一般價 — A 1,250 / B 600 每小時");
  });
});

describe("findNamesake", () => {
  const roster = [XIAOYU, person("示範小橘"), person("demo_kiki", { role: "staff", pricingPlanId: STAFF_PLAN.id })];

  it("R10 / T09: finds an active person with the same name and describes them", () => {
    expect(findNamesake(" 示範小雨 ", roster)).toEqual({ entry: XIAOYU, label: "示範小雨（老師 @demo_xiaoyu）" });
    expect(findNamesake("DEMO_KIKI", roster)?.label).toBe("demo_kiki（櫃檯）");
    expect(findNamesake("示範小藍", roster)).toBeNull();
  });

  it("T10: skips the person being edited and archived namesakes", () => {
    expect(findNamesake("示範小雨", roster, XIAOYU.id)).toBeNull();
    const archived = person("示範小鹿", { archivedAt: "2026-10-01T00:00:00Z" });
    expect(findNamesake("示範小鹿", [archived])).toBeNull();
  });
});

describe("isDirty", () => {
  it("S-I02 / T19: false until something changes, and false again once changed back", () => {
    const state = initRosterForm({ edit: XIAOYU }, PLANS);
    expect(isDirty(state)).toBe(false);
    const changed = apply(state, { type: "setField", field: "name", value: "示範小雨 Jia" });
    expect(isDirty(changed)).toBe(true);
    expect(isDirty(apply(changed, { type: "setField", field: "name", value: "示範小雨" }))).toBe(false);
  });

  it("T19: a phone that only got reformatted on blur is not a change", () => {
    const state = apply(initRosterForm({ edit: XIAOYU }, PLANS), { type: "blur", field: "phone" });
    expect(isDirty(state)).toBe(false);
  });
});

describe("needsPlanOnReactivate", () => {
  it("R23 / R24 / I-08: asks for a plan only when theirs has been archived", () => {
    expect(needsPlanOnReactivate(person("示範小鹿"), PLANS)).toBe(false);
    expect(needsPlanOnReactivate(person("示範小鹿", { pricingPlanId: OLD_TEACHER.id }), PLANS)).toBe(true);
    expect(needsPlanOnReactivate(person("示範小鹿", { pricingPlanId: "gone" }), PLANS)).toBe(true);
  });
});
