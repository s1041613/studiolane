import { describe, expect, it } from "vitest";
import { isInPreview, nextDateRange } from "@/lib/date-range";

describe("nextDateRange", () => {
  it("picks one day first and keeps the calendar open", () => {
    expect(nextDateRange(null, "2026-10-14")).toEqual({ range: { from: "2026-10-14", to: "2026-10-14" }, close: false });
  });

  it("turns a one-day pick into a range on a second day and closes", () => {
    const day = { from: "2026-10-14", to: "2026-10-14" };
    expect(nextDateRange(day, "2026-10-22")).toEqual({ range: { from: "2026-10-14", to: "2026-10-22" }, close: true });
  });

  it("orders the range when the second day comes first", () => {
    const day = { from: "2026-10-14", to: "2026-10-14" };
    expect(nextDateRange(day, "2026-10-09").range).toEqual({ from: "2026-10-09", to: "2026-10-14" });
  });

  it("starts over after a finished range", () => {
    const range = { from: "2026-10-14", to: "2026-10-22" };
    expect(nextDateRange(range, "2026-10-09")).toEqual({ range: { from: "2026-10-09", to: "2026-10-09" }, close: false });
  });

  it("keeps a single day when the same day is clicked again", () => {
    const day = { from: "2026-10-14", to: "2026-10-14" };
    expect(nextDateRange(day, "2026-10-14")).toEqual({ range: day, close: false });
  });
});

describe("isInPreview", () => {
  const day = { from: "2026-10-14", to: "2026-10-14" };

  it("previews the days between a one-day pick and the hovered day", () => {
    expect(isInPreview(day, "2026-10-17", "2026-10-15")).toBe(true);
    expect(isInPreview(day, "2026-10-17", "2026-10-17")).toBe(true);
    expect(isInPreview(day, "2026-10-17", "2026-10-18")).toBe(false);
  });

  it("previews nothing once a range is finished", () => {
    expect(isInPreview({ from: "2026-10-14", to: "2026-10-20" }, "2026-10-25", "2026-10-22")).toBe(false);
  });
});
