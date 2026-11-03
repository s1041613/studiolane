// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BookingActions } from "@/components/bookings/booking-actions";
import { makeRental } from "@/server/logic/test-fixtures";
import { PaymentState, RentalStatus } from "@/server/types/home";
import type { RentalSummary } from "@/server/types/home";
import type { ServerResult } from "@/lib/result";

// base-ui's Popover (the "⋯" menu) positions via ResizeObserver, which
// jsdom lacks; see src/components/shared/people/person-picker.test.tsx for
// the same stub.
class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", StubResizeObserver);
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}

const actions = vi.hoisted(() => ({
  confirmBooking: vi.fn(),
  markBookingPaid: vi.fn(),
  markBookingDone: vi.fn(),
  postponeBooking: vi.fn(),
  cancelBooking: vi.fn(),
}));

vi.mock("@/server/actions/bookings", () => actions);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const OK: ServerResult<null> = { ok: true, data: null };

function errored(code: string, message: string): ServerResult<null> {
  return { ok: false, error: { kind: "message", code: code as never, message, errorId: "abcd1234" } };
}

const RIVAL = makeRental({ id: "rival", date: "2099-06-01", start: "10:00", end: "11:00", person: "示範對手" });

function blockers(): ServerResult<null, { blockers: { conflicts: RentalSummary[] } }> {
  return {
    ok: false,
    error: {
      kind: "blockers",
      code: "FAILED_PRECONDITION",
      message: "跟 1 筆預約時間重疊，請先取消或延期下面這幾筆，再回來確認",
      blockers: { conflicts: [RIVAL] },
      errorId: "abcd1234",
    },
  };
}

function openEndMenu() {
  fireEvent.click(screen.getByRole("button", { name: "更多操作" }));
}

beforeEach(() => {
  actions.confirmBooking.mockResolvedValue(OK);
  actions.markBookingPaid.mockResolvedValue(OK);
  actions.markBookingDone.mockResolvedValue(OK);
  actions.postponeBooking.mockResolvedValue(OK);
  actions.cancelBooking.mockResolvedValue(OK);
});

describe("BookingActions: visibility follows allowedActions", () => {
  it("a pending booking shows 確認 and a ⋯ menu with 延期/取消", async () => {
    render(<BookingActions rental={makeRental({ id: "r1", date: "2099-06-01", status: RentalStatus.Pending })} />);
    expect(screen.getByRole("button", { name: "確認" })).toBeInTheDocument();
    openEndMenu();
    expect(await screen.findByText("延期")).toBeInTheDocument();
    expect(screen.getByText("取消")).toBeInTheDocument();
  });

  it("an awaiting-payment booking shows 標記已付款", () => {
    render(<BookingActions rental={makeRental({ id: "r1", date: "2099-06-01", status: RentalStatus.AwaitingPayment })} />);
    expect(screen.getByRole("button", { name: "標記已付款" })).toBeInTheDocument();
  });

  it("renders nothing for a completed, postponed or cancelled booking", () => {
    for (const status of [RentalStatus.Completed, RentalStatus.Postponed, RentalStatus.Cancelled]) {
      const { container, unmount } = render(<BookingActions rental={makeRental({ id: "r1", date: "2099-06-01", status })} />);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });
});

describe("BookingActions: primary button", () => {
  it("確認 success calls confirmBooking and shows no dialog", async () => {
    render(<BookingActions rental={makeRental({ id: "r1", date: "2099-06-01", status: RentalStatus.Pending })} />);

    fireEvent.click(screen.getByRole("button", { name: "確認" }));

    await waitFor(() => expect(actions.confirmBooking).toHaveBeenCalledWith("r1"));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("a blockers failure from confirmBooking opens a NoticeDialog listing the rival, OK only", async () => {
    actions.confirmBooking.mockResolvedValue(blockers());
    render(<BookingActions rental={makeRental({ id: "r1", date: "2099-06-01", status: RentalStatus.Pending })} />);

    fireEvent.click(screen.getByRole("button", { name: "確認" }));

    const dialog = await screen.findByRole("alertdialog", { name: "不能確認" });
    expect(dialog).toHaveTextContent("跟 1 筆預約時間重疊，請先取消或延期下面這幾筆，再回來確認");
    expect(dialog).toHaveTextContent("示範對手");
    expect(screen.queryByRole("button", { name: /確認這筆/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "確定" })).toBeInTheDocument();
  });

  it("a plain-message failure from markBookingPaid opens a NoticeDialog with that sentence", async () => {
    actions.markBookingPaid.mockResolvedValue(errored("FAILED_PRECONDITION", "跟已登記的預約重疊：示範小明 2099-06-01 10:00–11:00"));
    render(<BookingActions rental={makeRental({ id: "r1", date: "2099-06-01", status: RentalStatus.AwaitingPayment })} />);

    fireEvent.click(screen.getByRole("button", { name: "標記已付款" }));

    const dialog = await screen.findByRole("alertdialog", { name: "不能標記已付款" });
    expect(dialog).toHaveTextContent("跟已登記的預約重疊");
  });
});

describe("BookingActions: postpone / cancel", () => {
  it("取消 opens a ConfirmDialog with the refund warning when the booking is paid", async () => {
    const rental = makeRental({
      id: "r1",
      date: "2099-06-01",
      status: RentalStatus.Registered,
      paymentState: PaymentState.Paid,
      amount: 600,
    });
    render(<BookingActions rental={rental} />);

    openEndMenu();
    fireEvent.click(await screen.findByText("取消"));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("需要退款");
    expect(dialog).toHaveTextContent("600");
  });

  it("取消 opens a ConfirmDialog with no refund warning for an unpaid booking", async () => {
    const rental = makeRental({ id: "r1", date: "2099-06-01", status: RentalStatus.Pending });
    render(<BookingActions rental={rental} />);

    openEndMenu();
    fireEvent.click(await screen.findByText("取消"));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).not.toHaveTextContent("需要退款");
  });

  it("a failed cancelBooking keeps the ConfirmDialog open with the error inline, not a NoticeDialog", async () => {
    actions.cancelBooking.mockResolvedValue(errored("ABORTED", "這筆預約的狀態已經變動，請重新整理後再試一次"));
    const rental = makeRental({ id: "r1", date: "2099-06-01", status: RentalStatus.Pending });
    render(<BookingActions rental={rental} />);

    openEndMenu();
    fireEvent.click(await screen.findByText("取消"));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: /確定取消/ }));

    await waitFor(() => expect(dialog).toHaveTextContent("這筆預約的狀態已經變動"));
    expect(screen.getAllByRole("alertdialog")).toHaveLength(1);
  });

  it("a successful postponeBooking closes the dialog", async () => {
    const rental = makeRental({ id: "r1", date: "2099-06-01", status: RentalStatus.Pending });
    render(<BookingActions rental={rental} />);

    openEndMenu();
    fireEvent.click(await screen.findByText("延期"));
    fireEvent.click(screen.getByRole("button", { name: /確定延期/ }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });
});

describe("BookingActions: the primary button's own click guard", () => {
  // The ActionGroup wrapper matters once a row has more than one
  // ActionButton sharing it; today the primary button is the only one
  // (ConfirmDialog's confirm button owns its own pending separately), so
  // this exercises action-button.tsx's guard through this component rather
  // than in isolation (already covered by action-button.test.tsx).
  it("disables itself and ignores a repeat click while the action is in flight", async () => {
    const work = deferred<ServerResult<null>>();
    actions.confirmBooking.mockReturnValue(work.promise);
    render(<BookingActions rental={makeRental({ id: "r1", date: "2099-06-01", status: RentalStatus.Pending })} />);

    const confirmButton = screen.getByRole("button", { name: "確認" });
    fireEvent.click(confirmButton);
    await waitFor(() => expect(confirmButton).toBeDisabled());

    fireEvent.click(confirmButton);
    expect(actions.confirmBooking).toHaveBeenCalledTimes(1);

    work.resolve(OK);
    await waitFor(() => expect(confirmButton).not.toBeDisabled());
  });
});
