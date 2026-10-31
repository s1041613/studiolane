import { describe, expect, it } from "vitest";
import { scoreRosterKeywords } from "@/components/shared/people/roster-search";

describe("scoreRosterKeywords", () => {
  it("fuzzy-matches a subsequence of the name", () => {
    expect(scoreRosterKeywords("teacher-1", "王美", ["王小美"])).toBeGreaterThan(0);
  });

  it("ranks a closer name above a looser subsequence", () => {
    expect(scoreRosterKeywords("a", "王小美", ["王小美"])).toBeGreaterThan(
      scoreRosterKeywords("b", "王小美", ["王大小美"]),
    );
  });

  it("scores 0 for an unrelated query", () => {
    expect(scoreRosterKeywords("teacher-1", "阿凱", ["王小美"])).toBe(0);
  });

  it("never matches on the id in the value", () => {
    expect(scoreRosterKeywords("abc-123", "abc", ["王小美"])).toBe(0);
  });
});
