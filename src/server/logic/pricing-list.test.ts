import { describe, expect, it } from "vitest";
import { planUsage, sortPlans } from "@/server/logic/pricing-list";
import {
  ARCHIVED_AT,
  GENERAL,
  STAFF_PLAN,
  TEACHER_PLAN,
  AXING_PLAN,
  LULU_PLAN,
  person,
  plan,
} from "@/server/logic/__fixtures__/pricing-plans";

describe("sortPlans", () => {
  it("P01 / T01: customer → teacher → staff, same role by name", () => {
    const shuffled = [STAFF_PLAN, AXING_PLAN, TEACHER_PLAN, GENERAL, LULU_PLAN];
    const teachers = ["專屬價一", "老師價", "專屬價二"].sort((a, b) => a.localeCompare(b, "zh-Hant"));
    expect(sortPlans(shuffled).map((p) => p.appliesTo)).toEqual(["一般價", ...teachers, "櫃檯價"]);
  });

  it("T01: archived plans go last", () => {
    const old = { ...plan("old", "teacher", "舊老師價", 800, 300), archivedAt: ARCHIVED_AT };
    expect(sortPlans([old, STAFF_PLAN, GENERAL]).map((p) => p.id)).toEqual(["general", "staff", "old"]);
  });
});

describe("planUsage", () => {
  it("P02 / T02: counts active people only", () => {
    const roster = [
      ...Array.from({ length: 21 }, (_, i) => person(`老師${i}`, "teacher")),
      person("示範小鹿", "teacher", { archivedAt: ARCHIVED_AT }),
    ];
    expect(planUsage(TEACHER_PLAN, roster)).toMatchObject({ count: 21, label: "21 位使用中" });
    expect(planUsage(TEACHER_PLAN, roster).people.map((p) => p.name)).not.toContain("示範小鹿");
  });

  it("T02: names one or two people", () => {
    expect(planUsage(AXING_PLAN, [person("示範阿星", "demo_star")]).label).toBe("1 位：示範阿星");
    expect(planUsage(AXING_PLAN, [person("示範阿星", "demo_star"), person("示範露露", "demo_star")]).label).toBe("2 位：示範阿星、示範露露");
    expect(planUsage(AXING_PLAN, []).label).toBe("0 位使用中");
  });

  it("P03 / T03: the customer plan reads 客戶＋N 位外部老師", () => {
    const roster = [
      person("示範薄荷", "general", { role: "guest_teacher" }),
      person("示範阿樂", "general", { role: "guest_teacher" }),
      person("舊外師", "general", { role: "guest_teacher", archivedAt: ARCHIVED_AT }),
    ];
    expect(planUsage(GENERAL, roster)).toMatchObject({ count: 2, label: "客戶＋2 位外部老師" });
    expect(planUsage(GENERAL, []).label).toBe("客戶");
  });
});
