// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ok } from "@/lib/result";
import { RentalStatus } from "@/server/types/home";
import type { RentalSummary } from "@/server/types/home";
import { makeRental } from "@/server/logic/test-fixtures";
import { ALL_STATUSES } from "@/server/logic/bookings";
import type { BookingFilterDraft } from "@/server/logic/bookings";
import { BookingsView } from "@/components/bookings/bookings-view";

const dbDown = { kind: "message", code: "UNAVAILABLE", message: "資料庫暫時連不上，請稍後再試一次", errorId: "a1b2c3d4" } as const;

const INITIAL: BookingFilterDraft = { q: "", pay: "", statuses: ALL_STATUSES, from: "", to: "" };

afterEach(cleanup);

describe("BookingsView", () => {
  it("shows the empty hint when there are no rentals", () => {
    render(<BookingsView section={ok([])} initialFilters={INITIAL} />);

    expect(screen.getByText("沒有符合條件的預約")).toBeInTheDocument();
  });

  it("shows the failure message when the read fails", () => {
    render(<BookingsView section={{ ok: false, error: dbDown }} initialFilters={INITIAL} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("預約列表暫時讀不到");
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

    render(<BookingsView section={ok(rentals)} initialFilters={INITIAL} />);

    expect(screen.getAllByText(/撞單/)).toHaveLength(2);
    expect(screen.getAllByText("已登記")).toHaveLength(2);
  });

  it("shows distinct labels for 待確認, 待付款 and 已登記", () => {
    const rentals = [
      makeRental({ id: "pending", date: "2026-10-10", status: RentalStatus.Pending }),
      makeRental({ id: "awaiting", date: "2026-10-11", status: RentalStatus.AwaitingPayment }),
      makeRental({ id: "registered", date: "2026-10-12", status: RentalStatus.Registered }),
    ];

    render(<BookingsView section={ok(rentals)} initialFilters={INITIAL} />);

    expect(screen.getByText("待確認")).toBeInTheDocument();
    expect(screen.getByText("待付款")).toBeInTheDocument();
    expect(screen.getByText("已登記")).toBeInTheDocument();
  });

  it("filters rows by a non-empty query from the initial filters", () => {
    const rentals = [makeRental({ id: "a", person: "林小雨", date: "2026-10-10" }), makeRental({ id: "b", person: "周小貓", date: "2026-10-11" })];

    render(<BookingsView section={ok(rentals)} initialFilters={{ ...INITIAL, q: "小雨" }} />);

    const ids = screen
      .getAllByRole("row")
      .map((row) => row.getAttribute("data-rent"))
      .filter((id): id is string => id !== null);
    expect(ids).toEqual(["a"]);
  });

  it("matches the rental id as well as the renter name", () => {
    const rentals = [makeRental({ id: "R-77", person: "林小雨", date: "2026-10-01" }), makeRental({ id: "R-88", person: "周小貓", date: "2026-10-01" })];

    render(<BookingsView section={ok(rentals)} initialFilters={{ ...INITIAL, q: "r-88" }} />);

    expect(screen.getByText("周小貓")).toBeInTheDocument();
    expect(screen.queryByText("林小雨")).not.toBeInTheDocument();
  });

  it("shows 沒有符合條件的預約 whether there is no data at all or nothing matches the filters", () => {
    const rentals = [makeRental({ id: "a", person: "林小雨", date: "2026-10-10" })];

    const { rerender } = render(<BookingsView section={ok(rentals)} initialFilters={{ ...INITIAL, q: "不存在的人" }} />);
    expect(screen.getByText("沒有符合條件的預約")).toBeInTheDocument();

    rerender(<BookingsView section={ok([])} initialFilters={INITIAL} />);
    expect(screen.getByText("沒有符合條件的預約")).toBeInTheDocument();
  });

  it("prefills the search box with the initial query", () => {
    render(<BookingsView section={ok([])} initialFilters={{ ...INITIAL, q: "林小雨" }} />);

    expect(screen.getByRole("searchbox", { name: "搜尋" })).toHaveValue("林小雨");
  });
});

// 25 rentals, one per day 2026-10-01..25 so sorting by date gives 學員1..25
// in numeric order and page 1 (20/page) is exactly 學員1..20.
function days(n: number): RentalSummary[] {
  return Array.from({ length: n }, (_, i) =>
    makeRental({
      id: `r${i + 1}`,
      date: `2026-10-${String(i + 1).padStart(2, "0")}`,
      person: `學員 ${i + 1}`,
      status: RentalStatus.Pending,
    }),
  );
}

describe("BookingsView pagination", () => {
  it("resets to page 1 when a filter is applied", () => {
    render(<BookingsView section={ok(days(25))} initialFilters={INITIAL} />);

    fireEvent.click(screen.getByRole("button", { name: "下一頁" }));
    expect(screen.getByText("學員 21")).toBeInTheDocument();
    expect(screen.queryByText("學員 1")).not.toBeInTheDocument();

    // A real filter change through the real search box and 查詢 button,
    // not just a new object with the same values. "學員 1" substring-matches
    // 學員1 and 學員10..19, all on page 1, and drops 學員21.
    fireEvent.change(screen.getByRole("searchbox", { name: "搜尋" }), { target: { value: "學員 1" } });
    fireEvent.click(screen.getByRole("button", { name: "查詢" }));

    expect(screen.getByText("學員 1")).toBeInTheDocument();
    expect(screen.queryByText("學員 21")).not.toBeInTheDocument();
  });

  it("stays on the same page after an action changes the data but not the filters", () => {
    const rentals = days(25);
    const { rerender } = render(<BookingsView section={ok(rentals)} initialFilters={INITIAL} />);

    fireEvent.click(screen.getByRole("button", { name: "下一頁" }));
    expect(screen.getByText("學員 21")).toBeInTheDocument();

    // Simulates a server-action revalidate: new `rentals`, same filters
    // state (never touched), so bookings-view doesn't remount the table.
    const afterAction = rentals.filter((r) => r.person !== "學員 22");
    rerender(<BookingsView section={ok(afterAction)} initialFilters={INITIAL} />);

    expect(screen.getByText("學員 21")).toBeInTheDocument();
    expect(screen.queryByText("學員 1")).not.toBeInTheDocument();
  });
});

describe("BookingsView read failure", () => {
  it("keeps the column heads and shows the failure in place of the rows", () => {
    render(
      <BookingsView
        section={{ ok: false, error: { kind: "message", code: "UNAVAILABLE", message: "x", errorId: "5e21b7c4" } }}
        initialFilters={INITIAL}
      />,
    );

    const table = screen.getByRole("table", { name: "預約列表" });
    expect(within(table).getByRole("columnheader", { name: "姓名" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "金額" })).toBeInTheDocument();
    expect(within(table).queryAllByRole("cell")).toHaveLength(0);
    expect(screen.getByRole("alert")).toHaveTextContent("預約列表暫時讀不到");
    expect(screen.getByRole("alert")).toHaveTextContent("5E21B7C4");
    expect(screen.queryByRole("button", { name: "下一頁" })).not.toBeInTheDocument();
  });
});
