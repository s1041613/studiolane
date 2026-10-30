import { describe, expect, it } from "vitest";
import { ZHE_ERROR, payPercentFromInput, rolePricingFor, zheLabel } from "@/server/logic/purpose-pricing";
import type { PurposeSetting } from "@/server/logic/purpose-rules";

describe("打幾折 ↔ pay_percent", () => {
  it.each([
    ["8", 80],
    ["8.5", 85],
    ["9.9", 99],
    ["1", 10],
    [" 7 ", 70],
  ])("R09 / T04: 填 %s → 付 %i%%", (input, value) => {
    expect(payPercentFromInput(input)).toEqual({ ok: true, value });
  });

  it.each(["80", "0", "10", "8.55", "", "  ", "0.5", "abc", "-8", "8."])("R09 / T04: 填「%s」→ 錯誤", (input) => {
    expect(payPercentFromInput(input)).toEqual({ ok: false, reason: ZHE_ERROR });
  });

  it("R09: 錯誤訊息", () => {
    expect(ZHE_ERROR).toBe("請填 1–9.9：8 折填 8，85 折填 8.5");
  });

  it.each([
    [80, "8 折"],
    [85, "85 折"],
    [99, "99 折"],
    [10, "1 折"],
  ])("R02 / T05: %i → %s", (payPercent, label) => {
    expect(zheLabel(payPercent)).toBe(label);
  });
});

describe("rolePricingFor", () => {
  const SETTINGS: PurposeSetting[] = [
    {
      purpose: "yoga",
      allowedRoles: ["teacher", "staff"],
      rolePricing: { teacher: { mode: "discount", payPercent: 80 } },
      archivedAt: null,
    },
    { purpose: "dance", allowedRoles: ["teacher", "staff", "customer"], rolePricing: {}, archivedAt: null },
  ];

  it("T29 / E07: 身分沒開放（包括 guest_teacher）→ null", () => {
    expect(rolePricingFor("yoga", "customer", SETTINGS)).toBeNull();
    expect(rolePricingFor("yoga", "guest_teacher", SETTINGS)).toBeNull();
  });

  it("T29: 用途找不到 → null", () => {
    expect(rolePricingFor("performance", "teacher", SETTINGS)).toBeNull();
  });

  it("T29: 身分開放但沒設定計價 → null（方案價格）", () => {
    expect(rolePricingFor("yoga", "staff", SETTINGS)).toBeNull();
    expect(rolePricingFor("dance", "teacher", SETTINGS)).toBeNull();
  });

  it("T29: 身分開放且有設定 → 回傳該設定", () => {
    expect(rolePricingFor("yoga", "teacher", SETTINGS)).toEqual({ mode: "discount", payPercent: 80 });
  });

  it("T29 / E16: DB 裡有殘留的計價，但身分已經不開放 → 忽略，回傳 null", () => {
    const stale: PurposeSetting[] = [
      {
        purpose: "yoga",
        allowedRoles: ["teacher"],
        rolePricing: { teacher: { mode: "discount", payPercent: 80 }, staff: { mode: "price", roomA: 0, roomB: 0 } },
        archivedAt: null,
      },
    ];
    expect(rolePricingFor("yoga", "staff", stale)).toBeNull();
  });
});
