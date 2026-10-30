import { describe, expect, it } from "vitest";
import { parseRuleDraft } from "@/server/logic/rule-draft-schema";
import { EMPTY_RULE_DRAFT } from "@/server/logic/rental-rule-form";
import type { RuleDraft } from "@/server/logic/rental-rule-form";

function draft(overrides: Partial<RuleDraft>): RuleDraft {
  return { ...EMPTY_RULE_DRAFT, rooms: ["A"], weekdays: [1], start: "09:00", end: "12:00", reason: "測試", ...overrides };
}

describe("parseRuleDraft", () => {
  it("passes a well-formed draft through unchanged", () => {
    const input = draft({});
    expect(parseRuleDraft(input)).toEqual({ ok: true, draft: input });
  });

  it("end before start maps to a time field error, without throwing", () => {
    const result = parseRuleDraft(draft({ start: "13:30", end: "13:00" }));
    expect(result).toEqual({ ok: false, errors: { time: "結束要晚於開始" } });
  });

  it("end equal to start is also rejected", () => {
    const result = parseRuleDraft(draft({ start: "13:00", end: "13:00" }));
    expect(result).toEqual({ ok: false, errors: { time: "結束要晚於開始" } });
  });

  it("an empty start or end skips the ordering check (left to timeRangeError)", () => {
    expect(parseRuleDraft(draft({ start: "", end: "" }))).toEqual({ ok: true, draft: draft({ start: "", end: "" }) });
  });

  it("duplicate rooms map to the rooms field", () => {
    const result = parseRuleDraft(draft({ rooms: ["A", "A"] }));
    expect(result).toEqual({ ok: false, errors: { rooms: "請選教室" } });
  });

  it("an unknown room maps to the rooms field", () => {
    const result = parseRuleDraft(draft({ rooms: ["C" as never] }));
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ errors: { rooms: expect.any(String) } });
  });

  it("duplicate weekdays map to the weekdays field", () => {
    const result = parseRuleDraft(draft({ weekdays: [1, 1] }));
    expect(result).toEqual({ ok: false, errors: { weekdays: "請選至少一天" } });
  });

  it("a malformed onDate maps to the onDate field", () => {
    const result = parseRuleDraft(draft({ onDate: "2026/10/13" as never }));
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ errors: { onDate: expect.any(String) } });
  });

  it("an unknown mode or effect falls back to a form error", () => {
    expect(parseRuleDraft(draft({ mode: "monthly" as never }))).toMatchObject({ ok: false, errors: { form: expect.any(String) } });
    expect(parseRuleDraft(draft({ effect: "maybe" as never }))).toMatchObject({ ok: false, errors: { form: expect.any(String) } });
  });

  it("not an object falls back to the generic shape message", () => {
    expect(parseRuleDraft(null)).toEqual({ ok: false, errors: { form: "資料格式不正確，請重新整理再試一次" } });
    expect(parseRuleDraft("hello")).toEqual({ ok: false, errors: { form: "資料格式不正確，請重新整理再試一次" } });
    expect(parseRuleDraft(undefined)).toEqual({ ok: false, errors: { form: "資料格式不正確，請重新整理再試一次" } });
  });

  it("a missing field maps to that field's error", () => {
    const { reason, ...rest } = draft({});
    void reason;
    expect(parseRuleDraft(rest)).toMatchObject({ ok: false, errors: { reason: expect.any(String) } });
  });
});
