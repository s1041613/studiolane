import { describe, expect, it } from "vitest";
import { calendarDateToIso, isoToCalendarDate } from "@/lib/calendar-dates";

describe("calendar date conversions", () => {
  it("round-trips an ISO date through a local Date", () => {
    expect(calendarDateToIso(isoToCalendarDate("2026-10-04"))).toBe("2026-10-04");
  });

  it("reads the local calendar day, not the UTC one", () => {
    expect(calendarDateToIso(new Date(2026, 0, 1, 0, 30))).toBe("2026-01-01");
  });
});
