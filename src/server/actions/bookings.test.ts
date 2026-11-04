import { beforeEach, describe, expect, it, vi } from "vitest";
import { unseal } from "@/lib/result";
import { PaymentState, RentalStatus } from "@/server/types/home";
import type { RentalSummary } from "@/server/types/home";
import type { StatusPatch, StatusSnapshot } from "@/server/repositories/rental-repository";
import { makeRental, oneDayRule } from "@/server/logic/test-fixtures";
import { rivalSnapshot } from "@/server/logic/bookings";
import type { RentalRule } from "@/server/logic/booking-rules";

const data = vi.hoisted(() => ({
  rentals: [] as RentalSummary[],
  rules: [] as RentalRule[],
  transition: vi.fn<(id: string, expected: StatusSnapshot, patch: StatusPatch) => Promise<boolean>>(),
  lockRoom: vi.fn<(room: "A" | "B") => Promise<void>>(),
  confirmWithCancellations: vi.fn<(id: string, nextStatus: RentalStatus, cancellations: Array<{ id: string; note: string }>) => Promise<void>>(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// Signed in as uki; the DAL itself is covered by auth/require-staff.test.ts.
vi.mock("@/server/auth/require-staff", () => ({
  requireStaff: async () => ({ id: "r-07", name: "uki", authMethod: "password" }),
}));
// confirm/markPaid wrap their decision in withTransaction (room lock); the
// mocked RentalRepository below needs no real transaction to join, so this
// just runs the body directly.
vi.mock("@/server/drizzle/context", () => ({
  withTransaction: async (run: () => Promise<unknown>) => run(),
}));
vi.mock("@/server/repositories/rental-repository", () => ({
  RentalRepository: class {
    listAll = async () => data.rentals;
    findById = async (id: string) => data.rentals.find((r) => r.id === id) ?? null;
    transition = data.transition;
    lockRoom = data.lockRoom;
    confirmWithCancellations = data.confirmWithCancellations;
  },
}));
vi.mock("@/server/repositories/rules-repository", () => ({
  RulesRepository: class {
    listAll = async () => data.rules;
  },
}));

const { revalidatePath } = await import("next/cache");
const { confirmBooking, markBookingPaid, markBookingDone, postponeBooking, cancelBooking } = await import(
  "@/server/actions/bookings"
);

const ERROR_ID = expect.stringMatching(/^[0-9a-f]{8}$/);

// Every rental in this file starts far in the future with no blocking
// rules (data.rules defaults to []), so stillRentable passes trivially
// unless a test opts into a blocking rule.
const FUTURE_DATE = "2099-06-01";

beforeEach(() => {
  vi.clearAllMocks();
  data.rentals = [];
  data.rules = [];
  data.transition.mockResolvedValue(true);
  data.confirmWithCancellations.mockResolvedValue(undefined);
});

describe("confirmBooking", () => {
  it("confirms a rival-free on-site booking straight to registered", async () => {
    data.rentals = [
      makeRental({ id: "r1", date: FUTURE_DATE, start: "10:00", end: "11:00", room: "A", status: RentalStatus.Pending }),
    ];

    const result = unseal(await confirmBooking("r1"));

    expect(result).toEqual({ ok: true, data: null });
    expect(data.lockRoom).toHaveBeenCalledWith("A");
    expect(data.transition).toHaveBeenCalledWith(
      "r1",
      { status: RentalStatus.Pending, paymentState: PaymentState.Unpaid },
      { status: RentalStatus.Registered },
    );
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/bookings");
  });

  it("confirms a transfer booking to awaiting payment", async () => {
    const { PaymentMethod } = await import("@/server/types/home");
    data.rentals = [
      makeRental({
        id: "r1",
        date: FUTURE_DATE,
        start: "10:00",
        end: "11:00",
        status: RentalStatus.Pending,
        paymentMethod: PaymentMethod.Transfer,
      }),
    ];

    await confirmBooking("r1");

    expect(data.transition).toHaveBeenCalledWith(
      "r1",
      { status: RentalStatus.Pending, paymentState: PaymentState.Unpaid },
      { status: RentalStatus.AwaitingPayment },
    );
  });

  it("rejects with the rival list on an overlapping pending booking, and never writes", async () => {
    const rival = makeRental({
      id: "rival",
      date: FUTURE_DATE,
      start: "10:00",
      end: "11:00",
      room: "A",
      status: RentalStatus.Pending,
      createdAt: "2025-01-01T00:00:00Z",
    });
    const mine = makeRental({
      id: "r1",
      date: FUTURE_DATE,
      start: "10:30",
      end: "11:30",
      room: "A",
      status: RentalStatus.Pending,
      createdAt: "2025-06-01T00:00:00Z",
    });
    data.rentals = [rival, mine];

    const result = unseal(await confirmBooking("r1"));

    expect(result).toEqual({
      ok: false,
      error: {
        kind: "blockers",
        code: "FAILED_PRECONDITION",
        message: "跟 1 筆預約時間重疊，請先取消或延期下面這幾筆，再回來確認",
        blockers: { conflicts: [rival] },
        errorId: ERROR_ID,
      },
    });
    expect(data.transition).not.toHaveBeenCalled();
  });

  it("with cancelRivals matching the fresh rivals, confirms and cancels them in one write", async () => {
    const rival = makeRental({
      id: "rival",
      date: FUTURE_DATE,
      start: "10:00",
      end: "11:00",
      room: "A",
      status: RentalStatus.Registered,
      paymentState: PaymentState.Paid,
      amount: 600,
      note: "老客人",
    });
    const mine = makeRental({ id: "r1", date: FUTURE_DATE, start: "10:30", end: "11:30", room: "A", status: RentalStatus.Pending });
    data.rentals = [rival, mine];

    const result = unseal(await confirmBooking("r1", [rivalSnapshot(rival)]));

    expect(result).toEqual({ ok: true, data: null });
    expect(data.confirmWithCancellations).toHaveBeenCalledWith("r1", RentalStatus.Registered, [
      { id: "rival", note: "老客人【需要退款】" },
    ]);
    expect(data.transition).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/bookings");
  });

  it("with cancelRivals that no longer match the fresh rivals, refuses ABORTED and writes nothing", async () => {
    const rival = makeRental({ id: "rival", date: FUTURE_DATE, start: "10:00", end: "11:00", room: "A", status: RentalStatus.Pending });
    const mine = makeRental({ id: "r1", date: FUTURE_DATE, start: "10:30", end: "11:30", room: "A", status: RentalStatus.Pending });
    data.rentals = [rival, mine];

    const result = unseal(await confirmBooking("r1", [{ ...rivalSnapshot(rival), id: "some-other-id" }]));

    expect(result).toEqual({
      ok: false,
      error: { kind: "message", code: "ABORTED", message: "這筆預約的狀態已經變動，請重新整理後再試一次", errorId: ERROR_ID },
    });
    expect(data.confirmWithCancellations).not.toHaveBeenCalled();
    expect(data.transition).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("with a paid rival whose amount changed since review, refuses ABORTED and writes nothing", async () => {
    const reviewed = makeRental({ id: "rival", date: FUTURE_DATE, start: "10:00", end: "11:00", room: "A", status: RentalStatus.Registered, paymentState: PaymentState.Paid, amount: 0 });
    const mine = makeRental({ id: "r1", date: FUTURE_DATE, start: "10:30", end: "11:30", room: "A", status: RentalStatus.Pending });
    data.rentals = [{ ...reviewed, amount: 600 }, mine];

    const result = unseal(await confirmBooking("r1", [rivalSnapshot(reviewed)]));

    expect(result).toMatchObject({ ok: false, error: { code: "ABORTED" } });
    expect(data.confirmWithCancellations).not.toHaveBeenCalled();
    expect(data.transition).not.toHaveBeenCalled();
  });

  it("refuses NOT_FOUND for an unknown id", async () => {
    const result = unseal(await confirmBooking("missing"));
    expect(result).toEqual({ ok: false, error: { kind: "message", code: "NOT_FOUND", message: "找不到這筆預約", errorId: ERROR_ID } });
    expect(data.lockRoom).not.toHaveBeenCalled();
  });

  it("refuses FAILED_PRECONDITION when the current status doesn't allow confirm", async () => {
    data.rentals = [makeRental({ id: "r1", date: FUTURE_DATE, status: RentalStatus.Completed })];

    const result = unseal(await confirmBooking("r1"));

    expect(result).toMatchObject({ ok: false, error: { kind: "message", code: "FAILED_PRECONDITION" } });
    expect(data.transition).not.toHaveBeenCalled();
  });

  it("refuses NO_LONGER_RENTABLE when a rule now blocks the not-yet-started slot", async () => {
    data.rentals = [makeRental({ id: "r1", date: FUTURE_DATE, start: "10:00", end: "11:00", room: "A", status: RentalStatus.Pending })];
    data.rules = [oneDayRule("block-all", FUTURE_DATE, { room: "A", start: "00:00", end: "24:00", reason: "測試擋租" })];

    const result = unseal(await confirmBooking("r1"));

    expect(result).toEqual({
      ok: false,
      error: { kind: "message", code: "FAILED_PRECONDITION", message: "這段時間已經不能租", errorId: ERROR_ID },
    });
    expect(data.transition).not.toHaveBeenCalled();
  });

  it("returns ABORTED when transition loses the race, and does not revalidate", async () => {
    data.rentals = [makeRental({ id: "r1", date: FUTURE_DATE, status: RentalStatus.Pending })];
    data.transition.mockResolvedValue(false);

    const result = unseal(await confirmBooking("r1"));

    expect(result).toEqual({
      ok: false,
      error: { kind: "message", code: "ABORTED", message: "這筆預約的狀態已經變動，請重新整理後再試一次", errorId: ERROR_ID },
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("markBookingPaid", () => {
  it("moves awaiting payment to registered+paid", async () => {
    data.rentals = [makeRental({ id: "r1", date: FUTURE_DATE, status: RentalStatus.AwaitingPayment })];

    await markBookingPaid("r1");

    expect(data.lockRoom).toHaveBeenCalledWith("A");
    expect(data.transition).toHaveBeenCalledWith(
      "r1",
      { status: RentalStatus.AwaitingPayment, paymentState: PaymentState.Unpaid },
      { status: RentalStatus.Registered, paymentState: PaymentState.Paid },
    );
  });

  it("moves registered+unpaid (on-site) to registered+paid", async () => {
    data.rentals = [makeRental({ id: "r1", date: FUTURE_DATE, status: RentalStatus.Registered, paymentState: PaymentState.Unpaid })];

    const result = unseal(await markBookingPaid("r1"));

    expect(result).toEqual({ ok: true, data: null });
    expect(data.transition).toHaveBeenCalledWith(
      "r1",
      { status: RentalStatus.Registered, paymentState: PaymentState.Unpaid },
      { status: RentalStatus.Registered, paymentState: PaymentState.Paid },
    );
  });

  it("refuses when a different registered rental already holds an overlapping slot", async () => {
    const clash = makeRental({
      id: "clash",
      date: FUTURE_DATE,
      start: "10:00",
      end: "11:00",
      room: "A",
      status: RentalStatus.Registered,
      person: "小明",
    });
    const mine = makeRental({
      id: "r1",
      date: FUTURE_DATE,
      start: "10:30",
      end: "11:30",
      room: "A",
      status: RentalStatus.AwaitingPayment,
    });
    data.rentals = [clash, mine];

    const result = unseal(await markBookingPaid("r1"));

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "message", code: "FAILED_PRECONDITION", message: expect.stringContaining("小明") },
    });
    expect(data.transition).not.toHaveBeenCalled();
  });
});

describe("markBookingDone", () => {
  it("completes a registered+paid booking, without taking the room lock", async () => {
    data.rentals = [makeRental({ id: "r1", date: FUTURE_DATE, status: RentalStatus.Registered, paymentState: PaymentState.Paid })];

    const result = unseal(await markBookingDone("r1"));

    expect(result).toEqual({ ok: true, data: null });
    expect(data.lockRoom).not.toHaveBeenCalled();
    expect(data.transition).toHaveBeenCalledWith(
      "r1",
      { status: RentalStatus.Registered, paymentState: PaymentState.Paid },
      { status: RentalStatus.Completed },
    );
  });

  it("refuses via allowedActions when the booking isn't registered+paid yet", async () => {
    data.rentals = [makeRental({ id: "r1", date: FUTURE_DATE, status: RentalStatus.Pending })];

    const result = unseal(await markBookingDone("r1"));

    expect(result).toMatchObject({ ok: false, error: { kind: "message", code: "FAILED_PRECONDITION" } });
    expect(data.transition).not.toHaveBeenCalled();
  });
});

describe("postponeBooking / cancelBooking", () => {
  it("postpone appends 【需要退款】 when the booking was already paid", async () => {
    data.rentals = [
      makeRental({ id: "r1", date: FUTURE_DATE, status: RentalStatus.Registered, paymentState: PaymentState.Paid, amount: 600, note: "備註" }),
    ];

    await postponeBooking("r1");

    expect(data.lockRoom).not.toHaveBeenCalled();
    expect(data.transition).toHaveBeenCalledWith(
      "r1",
      { status: RentalStatus.Registered, paymentState: PaymentState.Paid },
      { status: RentalStatus.Postponed, note: "備註【需要退款】" },
    );
  });

  it("cancel leaves the note untouched when there's nothing to refund", async () => {
    data.rentals = [makeRental({ id: "r1", date: FUTURE_DATE, status: RentalStatus.Pending, note: "備註" })];

    await cancelBooking("r1");

    expect(data.transition).toHaveBeenCalledWith(
      "r1",
      { status: RentalStatus.Pending, paymentState: PaymentState.Unpaid },
      { status: RentalStatus.Cancelled, note: "備註" },
    );
  });
});
