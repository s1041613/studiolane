import { describe, expect, it } from "vitest";
import { RentalStatus } from "@/server/types/home";
import { makeRental } from "@/server/logic/test-fixtures";
import type { RentalRule } from "@/server/logic/booking-rules";
import {
  countAwaitingPayment,
  needsAttention,
  nextFreeSlot,
  rentalPhase,
  selectTodayRentals,
  spotlightRental,
} from "@/server/logic/desktop-widgets";

const TODAY = "2026-11-03";
// 14:05 Taipei.
const NOW = new Date("2026-11-03T14:05:00+08:00");

describe("selectTodayRentals", () => {
  it("keeps every status that still holds the room, in start order", () => {
    const rentals = [
      makeRental({ id: "late", date: TODAY, start: "18:00", end: "20:00", status: RentalStatus.Registered }),
      makeRental({ id: "pending", date: TODAY, start: "14:00", end: "16:00", status: RentalStatus.Pending }),
      makeRental({ id: "done", date: TODAY, start: "10:00", end: "12:00", status: RentalStatus.Completed }),
      makeRental({ id: "unpaid", date: TODAY, start: "20:00", end: "22:00", status: RentalStatus.AwaitingPayment }),
    ];

    expect(selectTodayRentals(rentals, TODAY).map((r) => r.id)).toEqual(["done", "pending", "late", "unpaid"]);
  });

  it("drops postponed and cancelled rentals and other days", () => {
    const rentals = [
      makeRental({ id: "postponed", date: TODAY, status: RentalStatus.Postponed }),
      makeRental({ id: "cancelled", date: TODAY, status: RentalStatus.Cancelled }),
      makeRental({ id: "tomorrow", date: "2026-11-04", status: RentalStatus.Registered }),
    ];

    expect(selectTodayRentals(rentals, TODAY)).toEqual([]);
  });

  it("includes last night's cross-midnight rental that ends this morning", () => {
    const overnight = makeRental({
      id: "overnight",
      date: "2026-11-02",
      start: "22:00",
      end: "01:00",
      isCrossMidnight: true,
      status: RentalStatus.Registered,
    });

    expect(selectTodayRentals([overnight], TODAY).map((r) => r.id)).toEqual(["overnight"]);
  });
});

describe("rentalPhase", () => {
  it("is past once the rental has ended, current while it runs, upcoming before", () => {
    expect(rentalPhase(makeRental({ date: TODAY, start: "10:00", end: "12:00" }), NOW)).toBe("past");
    expect(rentalPhase(makeRental({ date: TODAY, start: "14:00", end: "16:00" }), NOW)).toBe("current");
    expect(rentalPhase(makeRental({ date: TODAY, start: "18:00", end: "20:00" }), NOW)).toBe("upcoming");
  });

  it("treats the end instant as past (half-open interval)", () => {
    const rental = makeRental({ date: TODAY, start: "12:00", end: "14:05" });
    expect(rentalPhase(rental, NOW)).toBe("past");
  });
});

describe("spotlightRental", () => {
  const morning = makeRental({ id: "morning", date: TODAY, start: "10:00", end: "12:00" });
  const running = makeRental({ id: "running", date: TODAY, start: "14:00", end: "16:00" });
  const evening = makeRental({ id: "evening", date: TODAY, start: "18:00", end: "20:00" });

  it("picks the rental under way", () => {
    expect(spotlightRental([morning, running, evening], NOW)?.id).toBe("running");
  });

  it("falls back to the next rental to start", () => {
    expect(spotlightRental([morning, evening], NOW)?.id).toBe("evening");
  });

  it("is null once the day's rentals are all over", () => {
    expect(spotlightRental([morning], NOW)).toBeNull();
  });
});

describe("needsAttention", () => {
  it("flags 待確認 and 待付款 only", () => {
    const flagged = Object.values(RentalStatus).filter((status) =>
      needsAttention(makeRental({ date: TODAY, status })),
    );
    expect(flagged).toEqual([RentalStatus.Pending, RentalStatus.AwaitingPayment]);
  });
});

describe("countAwaitingPayment", () => {
  it("counts status 待付款 on any date", () => {
    const rentals = [
      makeRental({ id: "a", date: "2026-10-01", status: RentalStatus.AwaitingPayment }),
      makeRental({ id: "b", date: "2026-12-01", status: RentalStatus.AwaitingPayment }),
      makeRental({ id: "c", date: TODAY, status: RentalStatus.Registered }),
    ];

    expect(countAwaitingPayment(rentals)).toBe(2);
  });
});

describe("nextFreeSlot", () => {
  // 2026-11-03 is a Tuesday (weekday 2).
  function block(start: string, end: string, overrides: Partial<RentalRule> = {}): RentalRule {
    return {
      id: `${start}-${end}`,
      kind: "rental",
      room: null,
      weekday: 2,
      onDate: null,
      start,
      end,
      effect: "block",
      reason: "測試",
      archivedAt: null,
      ...overrides,
    };
  }
  // Open 08:00–24:00 every Tuesday.
  const NIGHT = block("00:00", "08:00");
  const registered = (start: string, end: string, room: "A" | "B" = "A") =>
    makeRental({ id: start, date: TODAY, start, end, room, status: RentalStatus.Registered });

  it("starts at the next half hour when the room is free now", () => {
    expect(nextFreeSlot("A", NOW, { rules: [NIGHT], existingRentals: [] })).toEqual({ start: "14:30", end: "24:00" });
  });

  it("skips past a registered rental under way", () => {
    const ctx = { rules: [NIGHT], existingRentals: [registered("14:00", "16:00")] };
    expect(nextFreeSlot("A", NOW, ctx)).toEqual({ start: "16:00", end: "24:00" });
  });

  it("only blocks that room", () => {
    const ctx = { rules: [NIGHT], existingRentals: [registered("14:00", "16:00", "B")] };
    expect(nextFreeSlot("A", NOW, ctx)?.start).toBe("14:30");
  });

  it("skips a gap shorter than 30 minutes", () => {
    const ctx = { rules: [NIGHT], existingRentals: [registered("12:00", "14:30"), registered("14:50", "18:00")] };
    expect(nextFreeSlot("A", NOW, ctx)).toEqual({ start: "18:00", end: "24:00" });
  });

  it("takes a gap of exactly 30 minutes", () => {
    const ctx = { rules: [NIGHT], existingRentals: [registered("12:00", "14:30"), registered("15:00", "18:00")] };
    expect(nextFreeSlot("A", NOW, ctx)).toEqual({ start: "14:30", end: "15:00" });
  });

  it("is null when the room is closed all day", () => {
    expect(nextFreeSlot("A", NOW, { rules: [block("00:00", "24:00")], existingRentals: [] })).toBeNull();
  });

  it("is null when the rest of the day is booked", () => {
    const ctx = { rules: [NIGHT], existingRentals: [registered("14:00", "24:00")] };
    expect(nextFreeSlot("A", NOW, ctx)).toBeNull();
  });

  it("is null once closing time has passed", () => {
    const ctx = { rules: [NIGHT, block("22:00", "24:00")], existingRentals: [] };
    expect(nextFreeSlot("A", new Date("2026-11-03T22:10:00+08:00"), ctx)).toBeNull();
  });

  it("ignores pending rentals, which don't hold the room", () => {
    const pending = makeRental({ date: TODAY, start: "14:00", end: "16:00", status: RentalStatus.Pending });
    expect(nextFreeSlot("A", NOW, { rules: [NIGHT], existingRentals: [pending] })?.start).toBe("14:30");
  });
});
