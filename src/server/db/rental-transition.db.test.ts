import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { TEST_DATABASE_URL } from "@/server/db/test-database-url";
import { PaymentMethod, PaymentState, RentalStatus } from "@/server/types/home";

// RentalRepository.transition against the real database: the guarded
// UPDATE applies when `expected` still matches the row, and — the one
// guarantee every action in src/server/actions/bookings.ts depends on —
// loses cleanly (no write, `false`) when it doesn't, including the genuine
// two-connection race the grounding calls out (two staff acting on the
// same row at once).
process.env.DATABASE_URL = TEST_DATABASE_URL;

const { RentalRepository } = await import("@/server/repositories/rental-repository");

const repo = new RentalRepository();
const admin = new Client({ connectionString: TEST_DATABASE_URL });
const batchId = randomUUID();
const createdIds: string[] = [];

function newRental(id: string) {
  createdIds.push(id);
  return {
    id,
    batchId,
    createdAt: new Date().toISOString(),
    date: "2033-01-05",
    start: "19:00",
    end: "20:00",
    isCrossMidnight: false,
    room: "B" as const,
    renterId: null,
    renterType: "customer" as const,
    renterName: "測試狀態轉換",
    purpose: "dance",
    note: "",
    paymentMethod: PaymentMethod.OnSite,
    paymentState: PaymentState.Unpaid,
    amount: 600,
    handler: "測試櫃檯",
  };
}

async function readRow(id: string) {
  const { rows } = await admin.query<{ status: string; payment_state: string; note: string }>(
    "select status, payment_state, note from rentals where id = $1",
    [id],
  );
  return rows[0];
}

beforeAll(async () => {
  await admin.connect();
});

afterAll(async () => {
  if (createdIds.length) await admin.query("delete from rentals where id = any($1::uuid[])", [createdIds]);
  await admin.end();
});

describe("RentalRepository.transition", () => {
  it("applies the patch and returns true when expected matches the row", async () => {
    const id = randomUUID();
    await repo.create([newRental(id)]);

    const applied = await repo.transition(
      id,
      { status: RentalStatus.Pending, paymentState: PaymentState.Unpaid },
      { status: RentalStatus.Registered, paymentState: PaymentState.Paid, note: "已付款" },
    );

    expect(applied).toBe(true);
    expect(await readRow(id)).toEqual({ status: "registered", payment_state: "paid", note: "已付款" });
  });

  it("returns false and leaves the row unchanged when another UPDATE already moved it", async () => {
    const id = randomUUID();
    await repo.create([newRental(id)]);
    await admin.query("update rentals set status = 'cancelled' where id = $1", [id]);

    const applied = await repo.transition(
      id,
      { status: RentalStatus.Pending, paymentState: PaymentState.Unpaid },
      { status: RentalStatus.Registered },
    );

    expect(applied).toBe(false);
    expect(await readRow(id)).toMatchObject({ status: "cancelled" });
  });

  it("returns false when status matches but paymentState doesn't (markPaid vs markDone)", async () => {
    const id = randomUUID();
    await repo.create([newRental(id)]);
    await admin.query("update rentals set status = 'registered', payment_state = 'paid' where id = $1", [id]);

    // A stale markDone read the row as Registered+Unpaid, but someone else
    // already marked it paid: the guard must refuse even though `status`
    // alone matches.
    const applied = await repo.transition(
      id,
      { status: RentalStatus.Registered, paymentState: PaymentState.Unpaid },
      { status: RentalStatus.Completed },
    );

    expect(applied).toBe(false);
    expect(await readRow(id)).toMatchObject({ status: "registered", payment_state: "paid" });
  });

  it("two concurrent transitions from the same stale snapshot: exactly one wins", async () => {
    const id = randomUUID();
    await repo.create([newRental(id)]);
    const expected = { status: RentalStatus.Pending, paymentState: PaymentState.Unpaid };

    const [confirmResult, cancelResult] = await Promise.all([
      repo.transition(id, expected, { status: RentalStatus.Registered }),
      repo.transition(id, expected, { status: RentalStatus.Cancelled }),
    ]);

    expect([confirmResult, cancelResult].filter(Boolean)).toHaveLength(1);
    const row = await readRow(id);
    expect(["registered", "cancelled"]).toContain(row.status);
  });
});
