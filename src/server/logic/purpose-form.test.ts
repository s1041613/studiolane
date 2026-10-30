import { describe, expect, it } from "vitest";
import {
  archiveConflict,
  changeRoleDraft,
  defaultRoleLockNote,
  defaultRoleLocks,
  discountHint,
  draftFromSetting,
  isPurposeDraftDirty,
  parsePurposeDraft,
  rolePlanHint,
  removedDefaultRolesConflict,
  validatePurposeDraft,
} from "@/server/logic/purpose-form";
import type { PurposeDraft, RoleDraft } from "@/server/logic/purpose-form";
import type { PricingPlan } from "@/server/logic/pricing";
import { SAMPLE_PURPOSE_SETTINGS } from "@/server/logic/test-fixtures";

const OPEN_PLAN: RoleDraft = { open: true, mode: "plan", rateA: "", rateB: "", zhe: "" };
const CLOSED: RoleDraft = { open: false, mode: "plan", rateA: "", rateB: "", zhe: "" };

function draft(overrides: Partial<PurposeDraft> = {}): PurposeDraft {
  return { teacher: { ...OPEN_PLAN }, staff: { ...CLOSED }, customer: { ...CLOSED }, ...overrides };
}

describe("編輯用途的檢查", () => {
  it("U04 / T11: 身分全部關掉 → 「至少要有一種身分能使用」", () => {
    expect(validatePurposeDraft("workshop", draft({ teacher: { ...CLOSED } }))).toEqual({
      ok: false,
      fieldErrors: { allowedRoles: "至少要有一種身分能使用" },
    });
  });

  it.each([
    ["500", ""],
    ["", "500"],
  ])("R08 / T12: 指定價格只填一間（A=%s, B=%s）→ 「A、B 要一起填」", (a, b) => {
    const result = validatePurposeDraft(
      "aerobics",
      draft({ teacher: { open: true, mode: "price", rateA: a, rateB: b, zhe: "" } }),
    );
    expect(result).toEqual({ ok: false, fieldErrors: { "roles.teacher": "A、B 要一起填" } });
  });

  it("R08 / T12: 指定價格兩格都空 → 「請填 A、B 間價格，或改回『方案價格』」", () => {
    const result = validatePurposeDraft(
      "aerobics",
      draft({ teacher: { open: true, mode: "price", rateA: "", rateB: "", zhe: "" } }),
    );
    expect(result).toEqual({ ok: false, fieldErrors: { "roles.teacher": "請填 A、B 間價格，或改回『方案價格』" } });
  });

  it.each(["-1", "100000", "1.5", "abc"])("R08 / T12: 指定價格 %s 不合法 → 「請填 0 到 99,999 的整數」", (rate) => {
    const result = validatePurposeDraft(
      "aerobics",
      draft({ teacher: { open: true, mode: "price", rateA: rate, rateB: "0", zhe: "" } }),
    );
    expect(result).toMatchObject({ ok: false, fieldErrors: { "roles.teacher": "請填 0 到 99,999 的整數" } });
  });

  it.each(["80", "0", "10", "8.55", "", "abc"])("R09 / T13: 折數 %s 不合法 → ZHE_ERROR", (zhe) => {
    const result = validatePurposeDraft(
      "aerobics",
      draft({ teacher: { open: true, mode: "discount", rateA: "", rateB: "", zhe } }),
    );
    expect(result).toMatchObject({ ok: false, fieldErrors: { "roles.teacher": "請填 1–9.9：8 折填 8，85 折填 8.5" } });
  });

  it("T06: 指定價格 500／200 → { mode: price, roomA: 500, roomB: 200 }", () => {
    const result = validatePurposeDraft(
      "aerobics",
      draft({ teacher: { open: true, mode: "price", rateA: "500", rateB: "200", zhe: "" } }),
    );
    expect(result).toEqual({
      ok: true,
      value: { allowedRoles: ["teacher"], rolePricing: { teacher: { mode: "price", roomA: 500, roomB: 200 } } },
    });
  });

  it("T07: 折扣 8 → { mode: discount, payPercent: 80 }；9.9 → 99", () => {
    const eight = validatePurposeDraft(
      "aerobics",
      draft({ teacher: { open: true, mode: "discount", rateA: "", rateB: "", zhe: "8" } }),
    );
    expect(eight).toMatchObject({ value: { rolePricing: { teacher: { mode: "discount", payPercent: 80 } } } });
    const nineNine = validatePurposeDraft(
      "aerobics",
      draft({ teacher: { open: true, mode: "discount", rateA: "", rateB: "", zhe: "9.9" } }),
    );
    expect(nineNine).toMatchObject({ value: { rolePricing: { teacher: { mode: "discount", payPercent: 99 } } } });
  });

  it("R10 / T08: 先選指定價格再切到折扣 → 只存折扣，沒有殘留的指定價格", () => {
    const result = validatePurposeDraft(
      "aerobics",
      draft({ teacher: { open: true, mode: "discount", rateA: "500", rateB: "200", zhe: "9" } }),
    );
    expect(result).toEqual({
      ok: true,
      value: { allowedRoles: ["teacher"], rolePricing: { teacher: { mode: "discount", payPercent: 90 } } },
    });
  });

  it("R05 / T09: 關掉的身分不輸出計價，等於刪除；就算欄位還留著舊值", () => {
    const result = validatePurposeDraft(
      "aerobics",
      draft({ teacher: { open: false, mode: "price", rateA: "500", rateB: "200", zhe: "" } }),
    );
    expect(result).toMatchObject({ ok: false, fieldErrors: { allowedRoles: "至少要有一種身分能使用" } });
  });

  it("E07 / T29: 沒開放的身分，即使帶著計價也被忽略（不是唯一開放身分時）", () => {
    const result = validatePurposeDraft(
      "aerobics",
      draft({
        teacher: { ...OPEN_PLAN },
        staff: { open: false, mode: "price", rateA: "500", rateB: "200", zhe: "" },
      }),
    );
    expect(result).toEqual({ ok: true, value: { allowedRoles: ["teacher"], rolePricing: {} } });
  });

  it("T10 / U03: 舞蹈拿掉老師 → 擋下，訊息說明預設身分", () => {
    const result = validatePurposeDraft(
      "dance",
      draft({ teacher: { ...CLOSED }, staff: { ...OPEN_PLAN }, customer: { ...OPEN_PLAN } }),
    );
    expect(result).toEqual({
      ok: false,
      fieldErrors: { allowedRoles: "舞蹈是老師和客戶的預設用途，不能拿掉這兩個身分" },
    });
  });

  it("T04: 櫃檯使用拿掉櫃檯 → 擋下", () => {
    expect(removedDefaultRolesConflict("front_desk", ["teacher"])).toBe("櫃檯使用是櫃檯的預設用途，不能拿掉這個身分");
  });

  it("T04: 不是預設用途、或保留了預設身分 → 不擋", () => {
    expect(removedDefaultRolesConflict("yoga", ["staff"])).toBeNull();
    expect(removedDefaultRolesConflict("dance", ["teacher", "customer"])).toBeNull();
  });

  it("U08 / T04: 預設用途不能停用", () => {
    expect(archiveConflict("dance")).toBe("舞蹈是老師和客戶的預設用途，不能停用");
    expect(archiveConflict("front_desk")).toBe("櫃檯使用是櫃檯的預設用途，不能停用");
    expect(archiveConflict("private_lesson")).toBeNull();
  });

  it("T19: defaultRoleLocks — 舞蹈鎖老師、客戶；櫃檯使用鎖櫃檯；其他用途不鎖", () => {
    expect(defaultRoleLocks("dance")).toEqual(["teacher", "customer"]);
    expect(defaultRoleLocks("front_desk")).toEqual(["staff"]);
    expect(defaultRoleLocks("yoga")).toEqual([]);
  });
});

describe("編輯對話框的狀態", () => {
  it("T17: draftFromSetting ↔ 存回去的值一致（指定價格）", () => {
    const performance = SAMPLE_PURPOSE_SETTINGS.find((s) => s.purpose === "performance")!;
    const initial = draftFromSetting(performance);
    expect(initial).toEqual({
      teacher: { open: true, mode: "price", rateA: "0", rateB: "0", zhe: "" },
      staff: { ...CLOSED },
      customer: { ...CLOSED },
    });
    expect(validatePurposeDraft("performance", initial)).toEqual({
      ok: true,
      value: { allowedRoles: ["teacher"], rolePricing: { teacher: { mode: "price", roomA: 0, roomB: 0 } } },
    });
  });

  it("T17: draftFromSetting ↔ 存回去的值一致（折扣）", () => {
    const setting = {
      purpose: "yoga" as const,
      allowedRoles: ["teacher" as const],
      rolePricing: { teacher: { mode: "discount" as const, payPercent: 85 } },
      archivedAt: null,
    };
    const initial = draftFromSetting(setting);
    expect(initial.teacher).toEqual({ open: true, mode: "discount", rateA: "", rateB: "", zhe: "8.5" });
    expect(validatePurposeDraft("yoga", initial)).toMatchObject({
      value: { rolePricing: { teacher: { mode: "discount", payPercent: 85 } } },
    });
  });

  it("T18: isPurposeDraftDirty — 開關、方式、數字任一改變就是 dirty", () => {
    const performance = SAMPLE_PURPOSE_SETTINGS.find((s) => s.purpose === "performance")!;
    const initial = draftFromSetting(performance);
    expect(isPurposeDraftDirty(initial, { ...initial })).toBe(false);
    expect(isPurposeDraftDirty(initial, { ...initial, staff: { ...OPEN_PLAN } })).toBe(true);
    expect(isPurposeDraftDirty(initial, { ...initial, teacher: { ...initial.teacher, mode: "discount" } })).toBe(true);
    expect(isPurposeDraftDirty(initial, { ...initial, teacher: { ...initial.teacher, rateA: "1" } })).toBe(true);
  });

  it("I-01: 關掉身分會清掉計價，再打開回到方案價格", () => {
    const priced: RoleDraft = { open: true, mode: "price", rateA: "500", rateB: "200", zhe: "" };
    const closed = changeRoleDraft(priced, { open: false });
    expect(closed).toEqual(CLOSED);
    expect(changeRoleDraft(closed, { open: true })).toEqual(OPEN_PLAN);
  });

  it("I-01: 其他欄位的修改照樣合併", () => {
    expect(changeRoleDraft(OPEN_PLAN, { mode: "discount", zhe: "8" })).toEqual({ ...OPEN_PLAN, mode: "discount", zhe: "8" });
  });
});

describe("身分卡片的說明文字", () => {
  const plan = (id: string, category: PricingPlan["category"], appliesTo: string, a: number, b: number, archivedAt: string | null = null): PricingPlan => ({
    id,
    category,
    appliesTo,
    roomARate: a,
    roomBRate: b,
    archivedAt,
  });
  const PLANS: PricingPlan[] = [
    plan("c1", "customer", "一般價", 1250, 600),
    plan("c4", "teacher", "專屬價二", 450, 200),
    plan("c2", "teacher", "老師價", 500, 250),
    plan("c3", "teacher", "專屬價一", 450, 200),
    plan("c9", "teacher", "舊老師價", 500, 200, "2026-01-01T00:00:00Z"),
    plan("c5", "staff", "櫃檯價", 0, 0),
  ];

  it("I-03: 方案價格列出這個身分在用的方案，停用的不列", () => {
    expect(rolePlanHint("teacher", PLANS)).toBe("照每位老師自己的價格方案（老師價 500／250、專屬價一 450／200、專屬價二 450／200）。");
    expect(rolePlanHint("customer", PLANS)).toBe("照每位客戶自己的價格方案（一般價 1,250／600）。");
    expect(rolePlanHint("staff", [])).toBe("照每位櫃檯自己的價格方案。");
  });

  it("I-04: 折扣試算只舉第一個方案", () => {
    expect(discountHint("8", "teacher", PLANS)).toBe("付方案價的 80%。例：老師價 500／250 → 400／200");
    // 250 × 0.85 = 212.5 rounds to 213: per-hour examples round like money.
    expect(discountHint("8.5", "teacher", PLANS)).toBe("付方案價的 85%。例：老師價 500／250 → 425／213");
    expect(discountHint("8.5", "customer", PLANS)).toBe("付方案價的 85%。例：一般價 1,250／600 → 1,063／510");
    expect(discountHint("8", "staff", [])).toBe("付方案價的 80%。");
  });

  it("I-04: 折數不合法時不顯示試算", () => {
    for (const zhe of ["", "80", "10", "8.55"]) expect(discountHint(zhe, "teacher", PLANS)).toBeNull();
  });

  it("I-02: 預設用途的身分卡片寫明為什麼不能關", () => {
    expect(defaultRoleLockNote("dance", "teacher")).toBe("舞蹈是老師的預設用途，不能關");
    expect(defaultRoleLockNote("front_desk", "staff")).toBe("櫃檯使用是櫃檯的預設用途，不能關");
  });
});

describe("server 收到的 request 先檢查形狀（E07）", () => {
  it("三個身分都對 → 原樣回傳", () => {
    const input = draft({ customer: { open: true, mode: "discount", rateA: "", rateB: "", zhe: "8.5" } });
    expect(parsePurposeDraft(input)).toEqual(input);
  });

  it("多出來的欄位會被丟掉", () => {
    const input = { ...draft(), guest_teacher: { ...OPEN_PLAN }, teacher: { ...OPEN_PLAN, extra: 1 } };
    expect(parsePurposeDraft(input)).toEqual(draft());
  });

  it.each([
    ["null", null],
    ["陣列", []],
    ["少了客戶", { teacher: OPEN_PLAN, staff: CLOSED }],
    ["身分不是物件", { ...draft(), staff: "closed" }],
    ["不認得的計價方式", { ...draft(), teacher: { ...OPEN_PLAN, mode: "coupon" } }],
    ["開關不是 boolean", { ...draft(), teacher: { ...OPEN_PLAN, open: 1 } }],
    ["數字欄位不是文字", { ...draft(), teacher: { ...OPEN_PLAN, rateA: 500 } }],
  ])("%s → null", (_, input) => {
    expect(parsePurposeDraft(input)).toBeNull();
  });
});
