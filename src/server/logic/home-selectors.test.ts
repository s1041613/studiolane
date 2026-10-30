import { describe, expect, it } from "vitest";
import {
  homeKpis,
  isPast,
  money,
  selectRentalsForDate,
  conflictInfo,
} from "@/server/logic/home-selectors";
import { RentalStatus, PaymentMethod, PaymentState } from "@/server/types/home";
import type { RentalSummary } from "@/server/types/home";
import { toStartsEndsAt } from "@/server/supabase/codecs";
import { addDays, todayIso } from "@/server/logic/date";

function makeRental(
  overrides: Partial<RentalSummary> & {
    date: string;
    start?: string;
    end?: string;
    isCrossMidnight?: boolean;
  },
): RentalSummary {
  const { date, start = "08:00", end = "09:00", isCrossMidnight = false, ...rest } = overrides;
  const { startsAt, endsAt } = toStartsEndsAt(date, start, end, isCrossMidnight);
  return {
    id: "r1",
    batchId: null,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    date,
    weekday: "二",
    start,
    end,
    isCrossMidnight,
    room: "A",
    handler: "",
    person: "測試",
    renterId: null,
    renterType: "customer",
    purpose: "dance",
    purposeLabel: "舞蹈",
    paymentState: PaymentState.Unpaid,
    status: RentalStatus.Registered,
    note: "",
    paymentMethod: PaymentMethod.OnSite,
    paymentMethodLabel: "現場繳費",
    amount: null,
    createdAt: "2026-01-01T00:00:00Z",
    ...rest,
  };
}

describe("money", () => {
  // The single source of truth for thousands separators; settings-form's
  // formatRate delegates to this.
  it("adds thousands separators", () => {
    expect(money(1250)).toBe("1,250");
    expect(money(500)).toBe("500");
    expect(money(0)).toBe("0");
  });
});

describe("isPast", () => {
  it("dims a rental dated in the past even if its end time-of-day hasn't occurred yet today", () => {
    const rental = makeRental({ date: "2026-09-20", end: "23:59" });
    expect(isPast(rental, new Date("2026-09-29T08:00:00+08:00"))).toBe(true);
  });

  it("does not dim a rental dated in the future even after its end time-of-day has passed today", () => {
    const rental = makeRental({ date: "2026-10-05", end: "10:00" });
    expect(isPast(rental, new Date("2026-09-29T23:00:00+08:00"))).toBe(false);
  });

  it("dims a same-day rental once its end time-of-day has passed", () => {
    const rental = makeRental({ date: "2026-09-29", end: "10:00" });
    expect(isPast(rental, new Date("2026-09-29T10:01:00+08:00"))).toBe(true);
    expect(isPast(rental, new Date("2026-09-29T09:59:00+08:00"))).toBe(false);
  });

  it("accounts for cross-midnight rentals by rolling the end date forward", () => {
    const rental = makeRental({ date: "2026-09-29", start: "23:00", end: "01:00", isCrossMidnight: true });
    expect(isPast(rental, new Date("2026-09-30T00:30:00+08:00"))).toBe(false);
    expect(isPast(rental, new Date("2026-09-30T01:30:00+08:00"))).toBe(true);
  });
});

describe("selectRentalsForDate", () => {
  it("only returns registered rentals matching the requested date, sorted by start time", () => {
    const items = [
      makeRental({ id: "a", date: "2026-09-29", start: "10:00", status: RentalStatus.Registered }),
      makeRental({ id: "b", date: "2026-09-29", start: "08:00", status: RentalStatus.Registered }),
      makeRental({ id: "c", date: "2026-09-29", start: "09:00", status: RentalStatus.Pending }),
      makeRental({ id: "d", date: "2026-09-30", start: "08:00", status: RentalStatus.Registered }),
    ];
    expect(selectRentalsForDate(items, "2026-09-29").map((r) => r.id)).toEqual(["b", "a"]);
  });

  // D2: a cross-midnight registered rental should appear on BOTH the day it
  // starts and the day it ends, since its interval intersects both days'
  // [00:00, 24:00) windows.
  it("includes a cross-midnight registered rental on both the night it starts and the morning it ends (D2)", () => {
    const crossMidnight = makeRental({
      id: "cross",
      date: "2026-10-16",
      start: "22:30",
      end: "00:30",
      isCrossMidnight: true,
      status: RentalStatus.Registered,
    });
    expect(selectRentalsForDate([crossMidnight], "2026-10-16").map((r) => r.id)).toEqual(["cross"]);
    expect(selectRentalsForDate([crossMidnight], "2026-10-17").map((r) => r.id)).toEqual(["cross"]);
    expect(selectRentalsForDate([crossMidnight], "2026-10-18")).toEqual([]);
  });
});

// Same Asia/Taipei "today" that homeKpis uses.
function isoDaysFromToday(offset: number): string {
  return addDays(todayIso(), offset);
}

describe("homeKpis pendingCount", () => {
  it("excludes pending rentals dated before today", () => {
    const items = [
      makeRental({ id: "stale", date: isoDaysFromToday(-30), status: RentalStatus.Pending }),
      makeRental({ id: "current", date: isoDaysFromToday(30), status: RentalStatus.Pending }),
    ];
    expect(homeKpis([], items).pendingCount).toBe(1);
  });

  it("includes a rental dated exactly today", () => {
    const items = [makeRental({ id: "today", date: isoDaysFromToday(0), status: RentalStatus.Pending })];
    expect(homeKpis([], items).pendingCount).toBe(1);
  });

  it("counts only 待確認, not registered, cancelled, awaiting payment or postponed", () => {
    const items = [
      makeRental({ id: "reg", date: isoDaysFromToday(1), status: RentalStatus.Registered }),
      makeRental({ id: "cancelled", date: isoDaysFromToday(1), status: RentalStatus.Cancelled }),
      makeRental({ id: "awaiting", date: isoDaysFromToday(1), status: RentalStatus.AwaitingPayment }),
      makeRental({ id: "postponed", date: isoDaysFromToday(1), status: RentalStatus.Postponed }),
      makeRental({ id: "pending", date: isoDaysFromToday(1), status: RentalStatus.Pending }),
    ];
    expect(homeKpis([], items).pendingCount).toBe(1);
  });
});

describe("conflictInfo", () => {
  it("numbers same-room same-time rivals in booking order and leaves non-conflicting rentals unnumbered", () => {
    const first = makeRental({ id: "first", date: "2026-10-01", start: "09:00", end: "10:00", room: "A", status: RentalStatus.Pending, createdAt: "2026-01-01T00:00:00Z" });
    const second = makeRental({ id: "second", date: "2026-10-01", start: "09:30", end: "10:30", room: "A", status: RentalStatus.Pending, createdAt: "2026-01-02T00:00:00Z" });
    const unrelated = makeRental({ id: "unrelated", date: "2026-10-01", start: "11:00", end: "12:00", room: "A", status: RentalStatus.Pending, createdAt: "2026-01-03T00:00:00Z" });
    const list = [first, second, unrelated];

    expect(conflictInfo(first, list)).toBe(1);
    expect(conflictInfo(second, list)).toBe(2);
    expect(conflictInfo(unrelated, list)).toBeNull();
  });

  it("does not flag a conflict when rooms differ even at the same date/time", () => {
    const roomA = makeRental({ id: "a", date: "2026-10-01", start: "09:00", end: "10:00", room: "A", status: RentalStatus.Pending });
    const roomB = makeRental({ id: "b", date: "2026-10-01", start: "09:00", end: "10:00", room: "B", status: RentalStatus.Pending });
    expect(conflictInfo(roomA, [roomA, roomB])).toBeNull();
    expect(conflictInfo(roomB, [roomA, roomB])).toBeNull();
  });

  it("B2: excludes registered/completed rentals from conflict ranking even when passed a full-status list", () => {
    const pending = makeRental({ id: "pending", date: "2026-10-01", start: "09:00", end: "10:00", room: "A", status: RentalStatus.Pending, createdAt: "2026-01-01T00:00:00Z" });
    const registered = makeRental({ id: "registered", date: "2026-10-01", start: "09:30", end: "10:30", room: "A", status: RentalStatus.Registered, createdAt: "2026-01-02T00:00:00Z" });
    const list = [pending, registered];

    expect(conflictInfo(pending, list)).toBeNull();
    expect(conflictInfo(registered, list)).toBeNull();
  });

  it("B2: postponed rentals do not participate in conflict ranking", () => {
    const pending = makeRental({ id: "pending", date: "2026-10-01", start: "09:00", end: "10:00", room: "A", status: RentalStatus.Pending });
    const postponed = makeRental({ id: "postponed", date: "2026-10-01", start: "09:30", end: "10:30", room: "A", status: RentalStatus.Postponed });
    const list = [pending, postponed];

    expect(conflictInfo(pending, list)).toBeNull();
    expect(conflictInfo(postponed, list)).toBeNull();
  });

  it("B2: awaiting-payment rentals still conflict with each other", () => {
    const a = makeRental({ id: "a", date: "2026-10-01", start: "09:00", end: "10:00", room: "A", status: RentalStatus.AwaitingPayment, createdAt: "2026-01-01T00:00:00Z" });
    const b = makeRental({ id: "b", date: "2026-10-01", start: "09:30", end: "10:30", room: "A", status: RentalStatus.AwaitingPayment, createdAt: "2026-01-02T00:00:00Z" });
    const list = [a, b];

    expect(conflictInfo(a, list)).toBe(1);
    expect(conflictInfo(b, list)).toBe(2);
  });

  // D3: same cross-midnight overlap case as booking.test.ts/
  // booking-rules.test.ts, verified here too since conflictInfo has its own
  // overlaps() implementation.
  it("flags a conflict between a cross-midnight rental and the next morning's booking (D3)", () => {
    const previousNight = makeRental({
      id: "previous-night",
      date: "2026-10-16",
      start: "22:30",
      end: "00:30",
      isCrossMidnight: true,
      room: "A",
      status: RentalStatus.Pending,
      createdAt: "2026-01-01T00:00:00Z",
    });
    const nextMorning = makeRental({
      id: "next-morning",
      date: "2026-10-17",
      start: "00:00",
      end: "00:30",
      room: "A",
      status: RentalStatus.Pending,
      createdAt: "2026-01-02T00:00:00Z",
    });
    const list = [previousNight, nextMorning];

    expect(conflictInfo(previousNight, list)).not.toBeNull();
    expect(conflictInfo(nextMorning, list)).not.toBeNull();
  });
});
