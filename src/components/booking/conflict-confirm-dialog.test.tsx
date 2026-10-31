// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ConflictConfirmDialog } from "@/components/booking/conflict-confirm-dialog";
import type { BookingConflict } from "@/server/logic/booking-conflicts";
import { RentalStatus } from "@/server/types/home";

afterEach(cleanup);

const conflicts: BookingConflict[] = [
  { id: "r1", date: "2031-03-05", start: "19:00", end: "20:00", renterName: "示範小華", status: RentalStatus.Pending },
];

describe("ConflictConfirmDialog", () => {
  it("lists each conflict's date, time, renter name and status label", () => {
    render(<ConflictConfirmDialog open conflicts={conflicts} onCancel={vi.fn()} onConfirmAnyway={vi.fn()} />);
    expect(screen.getByText(/示範小華/)).toBeInTheDocument();
    expect(screen.getByText(/19:00–20:00/)).toBeInTheDocument();
    expect(screen.getByText(/待確認/)).toBeInTheDocument();
  });

  it("lists every conflict when there is more than one", () => {
    const two = [...conflicts, { id: "r2", date: "2031-03-12", start: "09:00", end: "10:00", renterName: "示範小明", status: RentalStatus.AwaitingPayment }];
    render(<ConflictConfirmDialog open conflicts={two} onCancel={vi.fn()} onConfirmAnyway={vi.fn()} />);
    expect(screen.getByText(/示範小華/)).toBeInTheDocument();
    expect(screen.getByText(/示範小明/)).toBeInTheDocument();
  });

  it("取消 closes without resending", () => {
    const onCancel = vi.fn();
    const onConfirmAnyway = vi.fn();
    render(<ConflictConfirmDialog open conflicts={conflicts} onCancel={onCancel} onConfirmAnyway={onConfirmAnyway} />);
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirmAnyway).not.toHaveBeenCalled();
  });

  it("仍要送出 calls onConfirmAnyway", () => {
    const onConfirmAnyway = vi.fn(() => Promise.resolve());
    render(<ConflictConfirmDialog open conflicts={conflicts} onCancel={vi.fn()} onConfirmAnyway={onConfirmAnyway} />);
    fireEvent.click(screen.getByRole("button", { name: "仍要送出" }));
    expect(onConfirmAnyway).toHaveBeenCalledTimes(1);
  });
});
