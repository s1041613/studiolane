import { describe, expect, it } from "vitest";
import { formatRate, formatRates, parseRate } from "@/server/logic/settings-form";

describe("parseRate", () => {
  // 價格方案 B3 / 用途 B2: whole TWD per hour, 0..99,999
  it.each([
    ["500", 500],
    ["0", 0],
    ["99999", 99999],
    ["1,250", 1250],
    [" 600 ", 600],
  ])("reads %j as %i", (input, expected) => {
    expect(parseRate(input)).toEqual({ ok: true, value: expected });
  });

  it.each(["", "   ", "100000", "-1", "8.5", "abc", "1,5,0,0a"])("rejects %j", (input) => {
    expect(parseRate(input)).toEqual({ ok: false, reason: "請填 0 到 99,999 的整數" });
  });
});

describe("formatRates", () => {
  it("adds thousands separators", () => {
    expect(formatRate(1250)).toBe("1,250");
    expect(formatRate(500)).toBe("500");
  });

  // 人員名單 list: 「A／B」with a full-width slash
  it("joins room A and B rates with a full-width slash", () => {
    expect(formatRates(500, 250)).toBe("500／250");
    expect(formatRates(1250, 600)).toBe("1,250／600");
  });
});
