// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { RentalStatus } from "@/server/types/home";
import { makeRental } from "@/server/logic/test-fixtures";
import { bookingListFilters } from "@/server/logic/bookings";
import { BookingsView } from "@/components/bookings/bookings-view";

const dbDown = { kind: "message", code: "UNAVAILABLE", message: "資料庫暫時連不上，請稍後再試一次", errorId: "a1b2c3d4" } as const;

// The default folder (全部) ignores today entirely, so every test below
// can share one fixed day.
const TODAY = "2026-11-04";

afterEach(cleanup);

describe("BookingsView", () => {
  it("shows the empty hint when there are no rentals", () => {
    render(<BookingsView section={{ ok: true, data: [] }} today={TODAY} />);

    expect(screen.getByText("目前沒有預約")).toBeInTheDocument();
  });

  it("shows the failure message when the read fails", () => {
    render(<BookingsView section={{ ok: false, error: dbDown }} today={TODAY} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("預約列表暫時讀不到");
  });

  it("lists rentals oldest date first, and 日期 flips that", () => {
    const rentals = [
      makeRental({ id: "oldest", date: "2026-09-25" }),
      makeRental({ id: "newest", date: "2026-10-05" }),
      makeRental({ id: "middle", date: "2026-10-01" }),
    ];

    render(<BookingsView section={{ ok: true, data: rentals }} today={TODAY} />);

    const ids = screen
      .getAllByRole("row")
      .map((row) => row.getAttribute("data-rent"))
      .filter((id): id is string => id !== null);
    expect(ids).toEqual(["oldest", "middle", "newest"]);

    fireEvent.click(screen.getByRole("button", { name: /日期/ }));
    const flipped = screen
      .getAllByRole("row")
      .map((row) => row.getAttribute("data-rent"))
      .filter((id): id is string => id !== null);
    expect(flipped).toEqual(["newest", "middle", "oldest"]);
    expect(screen.getByRole("columnheader", { name: /日期/ })).toHaveAttribute("aria-sort", "descending");
  });

  it("orders the columns 日期 時段 租借人 用途 教室 狀態 付款 金額", () => {
    render(<BookingsView section={{ ok: true, data: [makeRental({ id: "a", date: "2026-11-04" })] }} today={TODAY} />);

    const headers = screen.getAllByRole("columnheader").map((th) => th.textContent?.replace(/[▲▼]/g, ""));
    expect(headers).toEqual(["日期", "時段", "租借人", "用途", "教室", "狀態", "付款", "金額"]);
  });

  it("titles the toolbar with the folder and walks folder history with 上一頁/下一頁", () => {
    render(<BookingsView section={{ ok: true, data: [makeRental({ id: "a", date: "2026-11-04", room: "B" })] }} today={TODAY} />);
    const title = () => screen.getByText((_, el) => el?.tagName === "P" && /^(全部|小教室)$/.test(el.textContent ?? ""));

    expect(title()).toHaveTextContent("全部");
    expect(screen.getByRole("button", { name: "上一頁" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /小教室/ }));
    expect(title()).toHaveTextContent("小教室");

    fireEvent.click(screen.getByRole("button", { name: "上一頁" }));
    expect(title()).toHaveTextContent("全部");
    expect(screen.getByRole("button", { name: "下一頁" })).toBeEnabled();
  });

  it("puts the search field in the toolbar with no 查詢 button", () => {
    render(<BookingsView section={{ ok: true, data: [makeRental({ id: "a", date: "2026-11-04" })] }} today={TODAY} />);

    expect(screen.getByRole("searchbox", { name: "搜尋" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "查詢" })).not.toBeInTheDocument();
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

    render(<BookingsView section={{ ok: true, data: rentals }} today={TODAY} />);

    // Scoped to the grid: the sidebar's own 撞單/已登記 folder labels would
    // otherwise double-count alongside the rows.
    const grid = within(screen.getByRole("grid", { name: "預約" }));
    expect(grid.getAllByText(/撞單/)).toHaveLength(2);
    expect(grid.getAllByText("已登記")).toHaveLength(2);
  });

  it("shows distinct labels for 待確認, 待付款 and 已登記", () => {
    const rentals = [
      makeRental({ id: "pending", date: "2026-10-10", status: RentalStatus.Pending }),
      makeRental({ id: "awaiting", date: "2026-10-11", status: RentalStatus.AwaitingPayment }),
      makeRental({ id: "registered", date: "2026-10-12", status: RentalStatus.Registered }),
    ];

    render(<BookingsView section={{ ok: true, data: rentals }} today={TODAY} />);

    const grid = within(screen.getByRole("grid", { name: "預約" }));
    expect(grid.getByText("待確認")).toBeInTheDocument();
    expect(grid.getByText("待付款")).toBeInTheDocument();
    expect(grid.getByText("已登記")).toBeInTheDocument();
  });

  it("filters rows by a non-empty query", () => {
    const rentals = [makeRental({ id: "a", person: "林小雨", date: "2026-10-10" }), makeRental({ id: "b", person: "周小貓", date: "2026-10-11" })];

    render(<BookingsView section={{ ok: true, data: rentals }} filters={bookingListFilters("小雨")} today={TODAY} />);

    const ids = screen
      .getAllByRole("row")
      .map((row) => row.getAttribute("data-rent"))
      .filter((id): id is string => id !== null);
    expect(ids).toEqual(["a"]);
  });

  it("matches the rental id as well as the renter name", () => {
    const rentals = [makeRental({ id: "R-77", person: "林小雨", date: "2026-10-01" }), makeRental({ id: "R-88", person: "周小貓", date: "2026-10-01" })];

    render(<BookingsView section={{ ok: true, data: rentals }} filters={bookingListFilters("r-88")} today={TODAY} />);

    expect(screen.getByText("周小貓")).toBeInTheDocument();
    expect(screen.queryByText("林小雨")).not.toBeInTheDocument();
  });

  it("shows 找不到符合的預約 when rentals exist but none match the query", () => {
    const rentals = [makeRental({ id: "a", person: "林小雨", date: "2026-10-10" })];

    render(<BookingsView section={{ ok: true, data: rentals }} filters={bookingListFilters("不存在的人")} today={TODAY} />);

    expect(screen.getByText("找不到符合的預約")).toBeInTheDocument();
    expect(screen.queryByText("目前沒有預約")).not.toBeInTheDocument();
  });

  it("still shows 目前沒有預約 when there is no data at all, regardless of query", () => {
    render(<BookingsView section={{ ok: true, data: [] }} filters={bookingListFilters("林小雨")} today={TODAY} />);

    expect(screen.getByText("目前沒有預約")).toBeInTheDocument();
    expect(screen.queryByText("找不到符合的預約")).not.toBeInTheDocument();
  });

  it("prefills the search input with the current query", () => {
    render(<BookingsView section={{ ok: true, data: [] }} filters={bookingListFilters("林小雨")} today={TODAY} />);

    expect(screen.getByRole("searchbox", { name: "搜尋" })).toHaveValue("林小雨");
  });

  it("shows 清除 only when a query is applied", () => {
    const { rerender } = render(<BookingsView section={{ ok: true, data: [] }} filters={bookingListFilters("林小雨")} today={TODAY} />);
    expect(screen.getByRole("link", { name: "清除" })).toBeInTheDocument();

    rerender(<BookingsView section={{ ok: true, data: [] }} filters={bookingListFilters("")} today={TODAY} />);
    expect(screen.queryByRole("link", { name: "清除" })).not.toBeInTheDocument();
  });
});
