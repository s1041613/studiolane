// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { RentalStatus } from "@/server/types/home";
import { makeRental } from "@/server/logic/test-fixtures";
import { BookingsView } from "@/components/bookings/bookings-view";

const dbDown = { kind: "message", code: "UNAVAILABLE", message: "資料庫暫時連不上，請稍後再試一次", errorId: "a1b2c3d4" } as const;

afterEach(cleanup);

describe("BookingsView", () => {
  it("shows the empty hint when there are no rentals", () => {
    render(<BookingsView section={{ ok: true, data: [] }} />);

    expect(screen.getByText("目前沒有預約")).toBeInTheDocument();
  });

  it("shows the failure message when the read fails", () => {
    render(<BookingsView section={{ ok: false, error: dbDown }} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("預約列表暫時讀不到");
  });

  it("lists rentals with the newest date first", () => {
    const rentals = [
      makeRental({ id: "oldest", date: "2026-09-25" }),
      makeRental({ id: "newest", date: "2026-10-05" }),
      makeRental({ id: "middle", date: "2026-10-01" }),
    ];

    render(<BookingsView section={{ ok: true, data: rentals }} />);

    const ids = screen
      .getAllByRole("row")
      .map((row) => row.getAttribute("data-rent"))
      .filter((id): id is string => id !== null);
    expect(ids).toEqual(["newest", "middle", "oldest"]);
  });

  it("flags overlapping pending bookings in the same room as 撞單, but not overlapping registered ones", () => {
    const rentals = [
      makeRental({
        id: "pending-a",
        date: "2026-10-10",
        start: "08:00",
        end: "09:00",
        room: "A",
        status: RentalStatus.Pending,
        createdAt: "2026-10-01T00:00:00Z",
      }),
      makeRental({
        id: "pending-b",
        date: "2026-10-10",
        start: "08:30",
        end: "09:30",
        room: "A",
        status: RentalStatus.Pending,
        createdAt: "2026-10-02T00:00:00Z",
      }),
      makeRental({
        id: "registered-a",
        date: "2026-10-11",
        start: "10:00",
        end: "11:00",
        room: "B",
        status: RentalStatus.Registered,
        createdAt: "2026-10-01T00:00:00Z",
      }),
      makeRental({
        id: "registered-b",
        date: "2026-10-11",
        start: "10:30",
        end: "11:30",
        room: "B",
        status: RentalStatus.Registered,
        createdAt: "2026-10-02T00:00:00Z",
      }),
    ];

    render(<BookingsView section={{ ok: true, data: rentals }} />);

    expect(screen.getAllByText(/撞單/)).toHaveLength(2);
    expect(screen.getAllByText("已登記")).toHaveLength(2);
  });

  it("shows distinct labels for 待確認, 待付款 and 已登記", () => {
    const rentals = [
      makeRental({ id: "pending", date: "2026-10-10", status: RentalStatus.Pending }),
      makeRental({ id: "awaiting", date: "2026-10-11", status: RentalStatus.AwaitingPayment }),
      makeRental({ id: "registered", date: "2026-10-12", status: RentalStatus.Registered }),
    ];

    render(<BookingsView section={{ ok: true, data: rentals }} />);

    expect(screen.getByText("待確認")).toBeInTheDocument();
    expect(screen.getByText("待付款")).toBeInTheDocument();
    expect(screen.getByText("已登記")).toBeInTheDocument();
  });
});
