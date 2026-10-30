import { describe, expect, it } from "vitest";
import {
  BOOKING_PURPOSE_ORDER,
  defaultPurposeFor,
  onlyForRolesReason,
  purposeAvailability,
  purposeOptions,
} from "@/server/logic/purpose-rules";
import type { PurposeSetting } from "@/server/logic/purpose-rules";
import type { Purpose } from "@/server/logic/booking";
import type { RoleCode } from "@/server/supabase/codecs";
import { SAMPLE_PURPOSE_SETTINGS } from "@/server/logic/test-fixtures";

function withSetting(purpose: Purpose, patch: Partial<PurposeSetting>): PurposeSetting[] {
  return SAMPLE_PURPOSE_SETTINGS.map((s) => (s.purpose === purpose ? { ...s, ...patch } : s));
}

describe("用途能不能選", () => {
  it.each<[Purpose, RoleCode, string]>([
    ["front_desk", "teacher", "僅限 櫃檯"],
    ["front_desk", "customer", "僅限 櫃檯"],
    ["photography", "teacher", "僅限 櫃檯"],
    ["performance", "customer", "僅限 老師"],
    ["performance", "staff", "僅限 老師"],
    ["workshop", "customer", "僅限 老師"],
  ])("U11 / T08: %s 在租借人是 %s 時「%s」", (purpose, role, reason) => {
    expect(purposeAvailability(purpose, role, SAMPLE_PURPOSE_SETTINGS)).toEqual({ ok: false, reason });
  });

  it.each<[Purpose, RoleCode]>([
    ["front_desk", "staff"],
    ["photography", "staff"],
    ["performance", "teacher"],
    ["workshop", "teacher"],
    ["private_lesson", "teacher"],
    ["dance", "customer"],
  ])("T08: %s 開放給 %s", (purpose, role) => {
    expect(purposeAvailability(purpose, role, SAMPLE_PURPOSE_SETTINGS)).toEqual({ ok: true });
  });

  it("T08: 停用的用途 → 「這個用途已停用」，不管身分", () => {
    const settings = withSetting("private_lesson", { archivedAt: "2026-10-13T00:00:00Z" });
    expect(purposeAvailability("private_lesson", "teacher", settings)).toEqual({ ok: false, reason: "這個用途已停用" });
  });

  it("T08: 沒有設定的用途當成停用", () => {
    const settings = SAMPLE_PURPOSE_SETTINGS.filter((s) => s.purpose !== "yoga");
    expect(purposeAvailability("yoga", "teacher", settings)).toEqual({ ok: false, reason: "這個用途已停用" });
  });

  it("U11: 多個身分用頓號、依 老師→櫃檯→客戶 排", () => {
    expect(onlyForRolesReason(["staff", "teacher"])).toBe("僅限 老師、櫃檯");
    expect(onlyForRolesReason(["customer", "teacher", "staff"])).toBe("僅限 老師、櫃檯、客戶");
  });
});

describe("預約表單的用途選項", () => {
  it("T08: 老師看到全部 8 個、依表單順序；身分不符的 disabled", () => {
    const options = purposeOptions(SAMPLE_PURPOSE_SETTINGS, "teacher");
    expect(options.map((o) => o.purpose)).toEqual([...BOOKING_PURPOSE_ORDER]);
    expect(Object.fromEntries(options.map((o) => [o.purpose, o.availability.ok]))).toEqual({
      dance: true,
      private_lesson: true,
      performance: true,
      aerobics: true,
      front_desk: false,
      workshop: true,
      photography: false,
      yoga: true,
    });
  });

  it("U07 / T08: 停用的用途完全不出現", () => {
    const settings = withSetting("private_lesson", { archivedAt: "2026-10-13T00:00:00Z" });
    expect(purposeOptions(settings, "teacher").map((o) => o.purpose)).not.toContain("private_lesson");
  });

  it("U11 / T08: 客戶的展演 disabled、旁邊「僅限 老師」", () => {
    const performance = purposeOptions(SAMPLE_PURPOSE_SETTINGS, "customer").find((o) => o.purpose === "performance");
    expect(performance?.availability).toEqual({ ok: false, reason: "僅限 老師" });
  });
});

describe("用途預設值", () => {
  it("F-用途-8: 櫃檯預設櫃檯使用", () => {
    expect(defaultPurposeFor("staff")).toBe("front_desk");
  });

  it.each<RoleCode>(["teacher", "customer"])("F-用途-8: %s 預設舞蹈", (role) => {
    expect(defaultPurposeFor(role)).toBe("dance");
  });
});
