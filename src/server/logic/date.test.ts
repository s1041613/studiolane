import { describe, expect, it } from "vitest";
import { WEEKDAY_ZH_ISO, isIsoDate, isoWeekday, shortDate, shortDateParts, todayIso } from "@/server/logic/date";

describe("isoWeekday", () => {
  // T01: 2026-10-19 is a Monday, 2026-10-11 a Sunday
  it("T01: returns 1 for Monday and 7 for Sunday", () => {
    expect(isoWeekday("2026-10-19")).toBe(1);
    expect(isoWeekday("2026-10-11")).toBe(7);
  });
});

describe("todayIso", () => {
  // T02: Taipei is UTC+8, so 17:30Z on 10/10 is already 01:30 on 10/11
  it("T02: uses the Taipei date after local midnight", () => {
    expect(todayIso(new Date("2026-10-10T17:30:00Z"))).toBe("2026-10-11");
  });

  // T03
  it("T03: stays on the Taipei date until 23:59:59 local", () => {
    expect(todayIso(new Date("2026-10-10T15:59:59Z"))).toBe("2026-10-10");
  });
});

describe("shortDateParts", () => {
  it("splits the month/day from the weekday so a table can align them", () => {
    expect(shortDateParts("2026-10-07")).toEqual({ monthDay: "10/7", weekday: "（三）" });
    expect(shortDateParts("2026-10-10")).toEqual({ monthDay: "10/10", weekday: "（六）" });
  });

  it("joins back into shortDate", () => {
    expect(shortDate("2026-10-10")).toBe("10/10（六）");
  });
});

describe("WEEKDAY_ZH_ISO", () => {
  // The shared array the rental_rules weekday column
  // keys into, indexed by isoWeekday()'s numbering (1 = Monday … 7 = Sunday).
  it("lines up with isoWeekday() for every day of a week", () => {
    expect(WEEKDAY_ZH_ISO[isoWeekday("2026-10-19")]).toBe("一"); // Monday
    expect(WEEKDAY_ZH_ISO[isoWeekday("2026-10-24")]).toBe("六"); // Saturday
    expect(WEEKDAY_ZH_ISO[isoWeekday("2026-10-11")]).toBe("日"); // Sunday
  });
});

describe("isIsoDate", () => {
  it("accepts a real yyyy-mm-dd day", () => {
    expect(isIsoDate("2026-10-15")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
  });

  it("rejects malformed or impossible days", () => {
    for (const value of ["", "foo", "2026-02", "2026-2-1", "2026-02-31", "2026-13-01", "2027-02-29"]) {
      expect(isIsoDate(value)).toBe(false);
    }
  });
});
