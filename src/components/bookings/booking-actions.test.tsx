// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BookingActions } from "@/components/bookings/booking-actions";
import { makeRental } from "@/server/logic/test-fixtures";
import { PaymentState, RentalStatus } from "@/server/types/home";
import type { RentalSummary } from "@/server/types/home";
import type { ServerResult } from "@/lib/result";

// base-ui's Menu (the 狀態 trigger's dropdown) positions via ResizeObserver,
// which jsdom lacks; see src/components/shared/people/person-picker.test.tsx
// for the same stub.
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

// BookingActions' open state is controlled by its row (bookings-shelf.tsx);
// this harness plays that role for the test.
function Harness({ rental }: { rental: RentalSummary }) {
  const [open, setOpen] = useState(false);
  return <BookingActions rental={rental} open={open} onOpenChange={setOpen} />;
}

function openMenu(label: string) {
  fireEvent.click(screen.getByRole("button", { name: `狀態 ${label}` }));
}

beforeEach(() => {
  actions.confirmBooking.mockResolvedValue(OK);
  actions.markBookingPaid.mockResolvedValue(OK);
  actions.markBookingDone.mockResolvedValue(OK);
  actions.postponeBooking.mockResolvedValue(OK);
  actions.cancelBooking.mockResolvedValue(OK);
});

describe("BookingActions: the 狀態 trigger follows allowedActions", () => {
  it("a pending booking's menu offers 確認, 延期… and 取消…", async () => {
    render(<Harness rental={makeRental({ id: "r1", date: "2099-06-01", status: RentalStatus.Pending })} />);

    openMenu("待確認");

    expect(await screen.findByRole("menuitem", { name: "確認" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "延期…" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "取消…" })).toBeInTheDocument();
  });

  it("an awaiting-payment booking's menu offers 標記已付款", async () => {
    render(<Harness rental={makeRental({ id: "r1", date: "2099-06-01", status: RentalStatus.AwaitingPayment })} />);

    openMenu("待付款");

    expect(await screen.findByRole("menuitem", { name: "標記已付款" })).toBeInTheDocument();
  });

  it("a completed, postponed or cancelled booking shows plain text with no trigger", () => {
    for (const status of [RentalStatus.Completed, RentalStatus.Postponed, RentalStatus.Cancelled]) {
      const { unmount } = render(<Harness rental={makeRental({ id: "r1", date: "2099-06-01", status })} />);
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      unmount();
    }
  });

  it("a clashing row's 確認 item is enabled and reads 確認, same as any other row", async () => {
    render(<Harness rental={makeRental({ id: "r1", date: "2099-06-01", status: RentalStatus.Pending })} />);

    openMenu("待確認");

    const confirmItem = await screen.findByRole("menuitem", { name: "確認" });
    expect(confirmItem).not.toHaveAttribute("aria-disabled");
  });
});

describe("BookingActions: primary menu items", () => {
  it("確認 success calls confirmBooking and closes the menu with no dialog", async () => {
    render(<Harness rental={makeRental({ id: "r1", date: "2099-06-01", status: RentalStatus.Pending })} />);

    openMenu("待確認");
    fireEvent.click(await screen.findByRole("menuitem", { name: "確認" }));

    await waitFor(() => expect(actions.confirmBooking).toHaveBeenCalledWith("r1"));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("a blockers failure from confirmBooking opens a ConfirmDialog naming the rival, with 返回 / 確認並取消其他", async () => {
    actions.confirmBooking.mockResolvedValue(blockers());
    render(<Harness rental={makeRental({ id: "r1", date: "2099-06-01", status: RentalStatus.Pending })} />);

    openMenu("待確認");
    fireEvent.click(await screen.findByRole("menuitem", { name: "確認" }));

    const dialog = await screen.findByRole("alertdialog", { name: "確認並取消重疊的預約？" });
    expect(dialog).toHaveTextContent("示範對手");
    expect(dialog).toHaveTextContent("保留");
    expect(dialog).toHaveTextContent("取消");
    expect(screen.getByRole("button", { name: "返回" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "確認並取消其他" })).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog", { name: "不能確認" })).not.toBeInTheDocument();
  });

  it("confirming the clash dialog calls confirmBooking again with the reviewed rival and closes on success", async () => {
    actions.confirmBooking.mockResolvedValueOnce(blockers()).mockResolvedValueOnce(OK);
    render(<Harness rental={makeRental({ id: "r1", date: "2099-06-01", status: RentalStatus.Pending })} />);

    openMenu("待確認");
    fireEvent.click(await screen.findByRole("menuitem", { name: "確認" }));
    await screen.findByRole("alertdialog", { name: "確認並取消重疊的預約？" });
    fireEvent.click(screen.getByRole("button", { name: "確認並取消其他" }));

    await waitFor(() => expect(actions.confirmBooking).toHaveBeenNthCalledWith(2, "r1", [expect.objectContaining({ id: "rival" })]));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("a stale clash confirm keeps the dialog open with the refresh notice inline", async () => {
    actions.confirmBooking
      .mockResolvedValueOnce(blockers())
      .mockResolvedValueOnce(errored("ABORTED", "這筆預約的狀態已經變動，請重新整理後再試一次"));
    render(<Harness rental={makeRental({ id: "r1", date: "2099-06-01", status: RentalStatus.Pending })} />);

    openMenu("待確認");
    fireEvent.click(await screen.findByRole("menuitem", { name: "確認" }));
    const dialog = await screen.findByRole("alertdialog", { name: "確認並取消重疊的預約？" });
    fireEvent.click(screen.getByRole("button", { name: "確認並取消其他" }));

    await waitFor(() => expect(dialog).toHaveTextContent("這筆預約的狀態已經變動"));
    expect(screen.getAllByRole("alertdialog")).toHaveLength(1);
  });

  it("a paid rival in the clash dialog shows the existing refund warning", async () => {
    const paidRival = makeRental({
      id: "rival",
      date: "2099-06-01",
      start: "10:00",
      end: "11:00",
      person: "示範對手",
      status: RentalStatus.Registered,
      paymentState: PaymentState.Paid,
      amount: 600,
    });
    actions.confirmBooking.mockResolvedValue({
      ok: false,
      error: {
        kind: "blockers",
        code: "FAILED_PRECONDITION",
        message: "跟 1 筆預約時間重疊，請先取消或延期下面這幾筆，再回來確認",
        blockers: { conflicts: [paidRival] },
        errorId: "abcd1234",
      },
    } satisfies ServerResult<null, { blockers: { conflicts: RentalSummary[] } }>);
    render(<Harness rental={makeRental({ id: "r1", date: "2099-06-01", status: RentalStatus.Pending })} />);

    openMenu("待確認");
    fireEvent.click(await screen.findByRole("menuitem", { name: "確認" }));

    const dialog = await screen.findByRole("alertdialog", { name: "確認並取消重疊的預約？" });
    expect(dialog).toHaveTextContent("需要退款");
    expect(dialog).toHaveTextContent("600");
  });

  it("a plain-message failure from markBookingPaid opens a NoticeDialog with that sentence", async () => {
    actions.markBookingPaid.mockResolvedValue(errored("FAILED_PRECONDITION", "跟已登記的預約重疊：示範小明 2099-06-01 10:00–11:00"));
    render(<Harness rental={makeRental({ id: "r1", date: "2099-06-01", status: RentalStatus.AwaitingPayment })} />);

    openMenu("待付款");
    fireEvent.click(await screen.findByRole("menuitem", { name: "標記已付款" }));

    const dialog = await screen.findByRole("alertdialog", { name: "不能標記已付款" });
    expect(dialog).toHaveTextContent("跟已登記的預約重疊");
  });
});

describe("BookingActions: postpone / cancel", () => {
  it("取消… opens a ConfirmDialog with the refund warning when the booking is paid", async () => {
    const rental = makeRental({
      id: "r1",
      date: "2099-06-01",
      status: RentalStatus.Registered,
      paymentState: PaymentState.Paid,
      amount: 600,
    });
    render(<Harness rental={rental} />);

    openMenu("已登記");
    fireEvent.click(await screen.findByRole("menuitem", { name: "取消…" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("需要退款");
    expect(dialog).toHaveTextContent("600");
  });

  it("取消… opens a ConfirmDialog with no refund warning for an unpaid booking", async () => {
    const rental = makeRental({ id: "r1", date: "2099-06-01", status: RentalStatus.Pending });
    render(<Harness rental={rental} />);

    openMenu("待確認");
    fireEvent.click(await screen.findByRole("menuitem", { name: "取消…" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).not.toHaveTextContent("需要退款");
  });

  it("a failed cancelBooking keeps the ConfirmDialog open with the error inline, not a NoticeDialog", async () => {
    actions.cancelBooking.mockResolvedValue(errored("ABORTED", "這筆預約的狀態已經變動，請重新整理後再試一次"));
    const rental = makeRental({ id: "r1", date: "2099-06-01", status: RentalStatus.Pending });
    render(<Harness rental={rental} />);

    openMenu("待確認");
    fireEvent.click(await screen.findByRole("menuitem", { name: "取消…" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: /確定取消/ }));

    await waitFor(() => expect(dialog).toHaveTextContent("這筆預約的狀態已經變動"));
    expect(screen.getAllByRole("alertdialog")).toHaveLength(1);
  });

  it("a successful postponeBooking closes the dialog", async () => {
    const rental = makeRental({ id: "r1", date: "2099-06-01", status: RentalStatus.Pending });
    render(<Harness rental={rental} />);

    openMenu("待確認");
    fireEvent.click(await screen.findByRole("menuitem", { name: "延期…" }));
    fireEvent.click(screen.getByRole("button", { name: /確定延期/ }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });
});
