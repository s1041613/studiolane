import { beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentState, RentalStatus } from "@/server/types/home";

// transition()'s real guard (does the UPDATE actually apply only when the
// row still matches) needs a real Postgres to prove — see
// src/server/db/rental-transition.db.test.ts. This mocked test only proves
// what transition() constructs: which columns eq() compares (so the guard
// can't silently drop a column), which columns set() writes, and that the
// boolean result mirrors whatever the mocked UPDATE returned.
const spies = vi.hoisted(() => ({ eq: vi.fn() }));

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: (...args: Parameters<typeof actual.eq>) => {
      spies.eq(...args);
      return actual.eq(...args);
    },
  };
});

const state = vi.hoisted(() => ({
  setCalls: [] as Array<Record<string, unknown>>,
  returning: [] as Array<{ id: string }>,
}));

vi.mock("@/server/drizzle/context", () => ({
  currentDb: () => ({
    update: () => ({
      set: (values: Record<string, unknown>) => {
        state.setCalls.push(values);
        return { where: () => ({ returning: async () => state.returning }) };
      },
    }),
  }),
}));

const { RentalRepository } = await import("@/server/repositories/rental-repository");
const { rentals } = await import("@/server/drizzle/schema/rentals");
const repo = new RentalRepository();

beforeEach(() => {
  vi.clearAllMocks();
  state.setCalls = [];
  state.returning = [];
});

describe("RentalRepository.transition", () => {
  it("writes only the patched columns and returns true when the mocked row matches", async () => {
    state.returning = [{ id: "r1" }];
    const result = await repo.transition(
      "r1",
      { status: RentalStatus.Pending, paymentState: PaymentState.Unpaid },
      { status: RentalStatus.Registered },
    );
    expect(result).toBe(true);
    expect(state.setCalls[0]).toEqual({ status: "registered" });
  });

  it("includes paymentState and note in the write only when the patch supplies them", async () => {
    state.returning = [{ id: "r1" }];
    await repo.transition(
      "r1",
      { status: RentalStatus.Registered, paymentState: PaymentState.Unpaid },
      { status: RentalStatus.Postponed, note: "【需要退款】" },
    );
    expect(state.setCalls[0]).toEqual({ status: "postponed", note: "【需要退款】" });
  });

  it("guards the write on id, status and paymentState together", async () => {
    state.returning = [{ id: "r1" }];
    await repo.transition(
      "r1",
      { status: RentalStatus.Registered, paymentState: PaymentState.Unpaid },
      { status: RentalStatus.Registered, paymentState: PaymentState.Paid },
    );
    const comparedColumns = spies.eq.mock.calls.map(([column]) => column);
    expect(comparedColumns).toEqual([rentals.id, rentals.status, rentals.paymentState]);
    const comparedValues = spies.eq.mock.calls.map(([, value]) => value);
    expect(comparedValues).toEqual(["r1", "registered", "unpaid"]);
  });

  it("returns false when the mocked UPDATE matches no row (a lost race)", async () => {
    state.returning = [];
    const result = await repo.transition(
      "r1",
      { status: RentalStatus.Registered, paymentState: PaymentState.Unpaid },
      { status: RentalStatus.Registered, paymentState: PaymentState.Paid },
    );
    expect(result).toBe(false);
  });
});
