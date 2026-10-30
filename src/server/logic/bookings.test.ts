import { describe, expect, it } from "vitest";
import {
  ALL_STATUSES,
  bookingsUrlForDay,
  initialBookingFilters,
  nextStatusOnConfirm,
  selectBookingRows,
} from "@/server/logic/bookings";
import { RentalStatus, PaymentMethod } from "@/server/types/home";
import { makeRental } from "@/server/logic/test-fixtures";

describe("selectBookingRows", () => {
  it("matches by person name or rental id, case-insensitively", () => {
    const items = [
      makeRental({ id: "R-01", person: "老師 C", date: "2026-09-29" }),
      makeRental({ id: "R-02", person: "老師 D", date: "2026-09-29" }),
    ];
    expect(selectBookingRows(items, { q: "老師 c" }).map((r) => r.id)).toEqual(["R-01"]);
    expect(selectBookingRows(items, { q: "r-02" }).map((r) => r.id)).toEqual(["R-02"]);
  });

  it("filters by status, payment method, and date range, all stackable", () => {
    const items = [
      makeRental({ id: "a", status: RentalStatus.Pending, paymentMethod: PaymentMethod.OnSite, date: "2026-09-25" }),
      makeRental({ id: "b", status: RentalStatus.Pending, paymentMethod: PaymentMethod.Transfer, date: "2026-09-25" }),
      makeRental({ id: "c", status: RentalStatus.Registered, paymentMethod: PaymentMethod.OnSite, date: "2026-09-25" }),
      makeRental({ id: "d", status: RentalStatus.Pending, paymentMethod: PaymentMethod.OnSite, date: "2026-10-05" }),
    ];
    expect(
      selectBookingRows(items, {
        statuses: [RentalStatus.Pending],
        pay: PaymentMethod.OnSite,
        from: "2026-09-01",
        to: "2026-09-30",
      }).map((r) => r.id),
    ).toEqual(["a"]);
  });

  it("returns an empty list when nothing matches", () => {
    const items = [makeRental({ id: "a", status: RentalStatus.Pending, date: "2026-09-25" })];
    expect(selectBookingRows(items, { statuses: [RentalStatus.Cancelled] })).toEqual([]);
  });

  it("sorts by status priority, then date, then start time", () => {
    const items = [
      makeRental({ id: "postponed", status: RentalStatus.Postponed, date: "2026-09-25", start: "08:00" }),
      makeRental({ id: "completed", status: RentalStatus.Completed, date: "2026-09-25", start: "08:00" }),
      makeRental({ id: "registered", status: RentalStatus.Registered, date: "2026-09-25", start: "08:00" }),
      makeRental({ id: "awaiting", status: RentalStatus.AwaitingPayment, date: "2026-09-25", start: "08:00" }),
      makeRental({ id: "pending-late", status: RentalStatus.Pending, date: "2026-09-26", start: "08:00" }),
      makeRental({ id: "pending-early", status: RentalStatus.Pending, date: "2026-09-25", start: "07:00" }),
      makeRental({ id: "cancelled", status: RentalStatus.Cancelled, date: "2026-09-25", start: "08:00" }),
    ];
    expect(selectBookingRows(items, {}).map((r) => r.id)).toEqual([
      "pending-early",
      "pending-late",
      "awaiting",
      "registered",
      "completed",
      "postponed",
      "cancelled",
    ]);
  });
});

describe("initialBookingFilters", () => {
  it("opens on 待確認 only, any date, when no day is passed", () => {
    expect(initialBookingFilters()).toEqual({ q: "", pay: "", statuses: [RentalStatus.Pending], from: "", to: "" });
  });

  it("HM21: a day from 首頁 opens on that day with every status", () => {
    expect(initialBookingFilters("2026-10-14")).toEqual({
      q: "",
      pay: "",
      statuses: ALL_STATUSES,
      from: "2026-10-14",
      to: "2026-10-14",
    });
  });

  it("ignores a malformed day", () => {
    expect(initialBookingFilters("10/14")).toEqual(initialBookingFilters());
    expect(initialBookingFilters("2026-02-31")).toEqual(initialBookingFilters());
  });
});

describe("bookingsUrlForDay", () => {
  it("HM21: passes the day for 預約追蹤 to open on", () => {
    const url = new URL(bookingsUrlForDay("2026-10-14"), "http://x");
    expect(url.pathname).toBe("/bookings");
    expect(initialBookingFilters(url.searchParams.get("day") ?? undefined).from).toBe("2026-10-14");
  });
});

describe("nextStatusOnConfirm", () => {
  it("registers an on-site-payment booking directly", () => {
    const rental = makeRental({ paymentMethod: PaymentMethod.OnSite, date: "2026-09-29" });
    expect(nextStatusOnConfirm(rental)).toBe(RentalStatus.Registered);
  });

  it("moves a transfer-payment booking to awaiting-payment", () => {
    const rental = makeRental({ paymentMethod: PaymentMethod.Transfer, date: "2026-09-29" });
    expect(nextStatusOnConfirm(rental)).toBe(RentalStatus.AwaitingPayment);
  });
});
