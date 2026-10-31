// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { BookingSheet } from "@/components/booking/booking-sheet";
import { getAvailableWindows } from "@/server/logic/booking-rules";
import { addDays, todayIso } from "@/server/logic/date";
import { RentalStatus } from "@/server/types/home";
import { SAMPLE_PLANS, SAMPLE_PURPOSE_SETTINGS, SAMPLE_RULES, makeRental } from "@/server/logic/test-fixtures";
import { seal } from "@/lib/result";
import { submitBooking } from "@/server/actions/submit-booking";

vi.mock("@/server/actions/submit-booking", () => ({
  submitBooking: vi.fn(),
}));

afterEach(cleanup);

// cmdk observes its list's size and jsdom has no ResizeObserver.
class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = StubResizeObserver;

const RENTER_NAME = "阿明";
// Two days out so clipWindowsToNow, which only clips today, never applies.
const DATE = addDays(todayIso(), 2);
const WINDOW = getAvailableWindows("B", DATE, { rules: SAMPLE_RULES, existingRentals: [] })[0];

function baseProps() {
  return {
    initialRules: SAMPLE_RULES,
    initialRoster: [],
    initialPlans: SAMPLE_PLANS,
    initialRentals: [],
    initialPurposeSettings: SAMPLE_PURPOSE_SETTINGS,
  };
}

// A new 外部客戶, one date, and the first open window as the slot's time.
// Purpose and payment keep their defaults.
async function fillAndSubmit() {
  fireEvent.click(screen.getByRole("button", { name: "選擇租借人…" }));
  fireEvent.change(screen.getByPlaceholderText("搜尋姓名…"), { target: { value: RENTER_NAME } });
  fireEvent.click(screen.getByRole("option", { name: `新增「${RENTER_NAME}」為外部客戶` }));

  fireEvent.click(screen.getByRole("button", { name: "選擇日期" }));
  // DATE may fall in a later month than the calendar opens on.
  const nextMonth = screen.getByRole("button", { name: "Go to the Next Month" });
  for (let i = 0; i < 2 && !document.querySelector(`[data-day="${DATE}"]`); i++) {
    fireEvent.click(nextMonth);
  }
  const dayCell = document.querySelector<HTMLElement>(`[data-day="${DATE}"]`);
  if (!dayCell) throw new Error(`no day cell for ${DATE}`);
  fireEvent.click(within(dayCell).getByRole("button"));

  fireEvent.click(screen.getByRole("button", { name: `${WINDOW.start}–${WINDOW.end}` }));

  fireEvent.click(screen.getByRole("button", { name: "送出預約" }));
  await screen.findByRole("alertdialog", { name: "預約已送出" });
}

describe("BookingSheet success notice", () => {
  it("shows no field errors once the server's revalidated data echoes the just-written booking back", async () => {
    vi.mocked(submitBooking).mockResolvedValue(seal({ ok: true, data: { batchId: "batch-1", rentalIds: ["rental-1"] } }));

    const { rerender } = render(<BookingSheet {...baseProps()} />);
    await fillAndSubmit();

    expect(screen.queryByText(/個地方需要處理/)).not.toBeInTheDocument();
    expect(screen.queryByText("你已經預約過這個時段")).not.toBeInTheDocument();

    // The server action's revalidation hands back the booking just written.
    const writtenRental = makeRental({
      id: "rental-1",
      date: DATE,
      start: WINDOW.start,
      end: WINDOW.end,
      room: "B",
      renterType: "customer",
      person: RENTER_NAME,
      status: RentalStatus.Pending,
    });
    rerender(<BookingSheet {...baseProps()} initialRentals={[writtenRental]} />);

    expect(screen.getByRole("alertdialog", { name: "預約已送出" })).toBeInTheDocument();
    expect(screen.queryByText(/個地方需要處理/)).not.toBeInTheDocument();
    expect(screen.queryByText("你已經預約過這個時段")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "確定" }));

    expect(screen.queryByRole("alertdialog", { name: "預約已送出" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "選擇租借人…" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("你已經預約過這個時段")).not.toBeInTheDocument();
  });
});
