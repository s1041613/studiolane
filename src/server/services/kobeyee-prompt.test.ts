import { describe, expect, it } from "vitest";
import { buildKobeyeePrompt } from "@/server/services/kobeyee-prompt";

describe("buildKobeyeePrompt", () => {
  it("includes the message verbatim", () => {
    const prompt = buildKobeyeePrompt("10/21、23晚上8:00-9:00小教室", "2026-11-04");
    expect(prompt).toContain("10/21、23晚上8:00-9:00小教室");
  });

  it("includes today's date so relative phrases have a reference point", () => {
    const prompt = buildKobeyeePrompt("明天方便嗎", "2026-11-04");
    expect(prompt).toContain("2026-11-04");
  });

  it("states the room letters and every purpose code", () => {
    const prompt = buildKobeyeePrompt("x", "2026-11-04");
    expect(prompt).toContain('room "A"');
    expect(prompt).toContain('room "B"');
    expect(prompt).toContain("private_lesson");
    expect(prompt).toContain("dance");
    expect(prompt).toContain("yoga");
  });

  it("tells the model to output DateMention, not a resolved date", () => {
    const prompt = buildKobeyeePrompt("x", "2026-11-04");
    expect(prompt).toContain("DateMention");
  });

  it("is a pure function of its two inputs", () => {
    const first = buildKobeyeePrompt("hello", "2026-11-04");
    const second = buildKobeyeePrompt("hello", "2026-11-04");
    expect(first).toBe(second);
  });

  it("changes when the message changes", () => {
    const a = buildKobeyeePrompt("訊息甲", "2026-11-04");
    const b = buildKobeyeePrompt("訊息乙", "2026-11-04");
    expect(a).not.toBe(b);
  });

  it("changes when today changes", () => {
    const a = buildKobeyeePrompt("hello", "2026-11-04");
    const b = buildKobeyeePrompt("hello", "2026-12-25");
    expect(a).not.toBe(b);
  });
});
