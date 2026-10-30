import { describe, expect, it } from "vitest";
import { activeOnly } from "@/server/logic/active-only";

describe("activeOnly (SH15 / T16)", () => {
  it("drops archived rows and keeps the original order", () => {
    const rows = [
      { name: "示範小雨", archivedAt: null },
      { name: "示範小鹿", archivedAt: "2026-10-01T00:00:00Z" },
      { name: "示範小橘", archivedAt: null },
    ];
    expect(activeOnly(rows).map((r) => r.name)).toEqual(["示範小雨", "示範小橘"]);
  });
});
