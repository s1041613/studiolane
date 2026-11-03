import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { TEST_DATABASE_URL } from "@/server/db/test-database-url";
import { findRegisteredOverlaps, planConfirm } from "@/server/logic/bookings";
import { PaymentMethod, PaymentState, RentalStatus } from "@/server/types/home";

// src/server/actions/bookings.ts's confirmBooking/markBookingPaid decide from
// every rental in the room (planConfirm's rivals, findRegisteredOverlaps),
// then write through RentalRepository.transition's per-row guard. The room
// lock (RentalRepository.lockRoom, same key as create_booking_batch's) is
// what keeps that cross-row read from racing another confirm/markPaid on the
// same room. This file proves the lock is real against the live database.
//
// It drives RentalRepository + the logic functions directly rather than the
// "use server" actions themselves: those actions call revalidatePath (via
// runAction) and requireStaff, both of which assume an active Next.js
// request context that doesn't exist here (revalidatePath throws
// "static generation store missing" when called outside one). The sequence
// below — findById, withTransaction(lockRoom, listAll, plan, transition) —
// is exactly what the actions run; only the auth/revalidate wrapper is left
// out, and that wrapper has no bearing on the lock.
process.env.DATABASE_URL = TEST_DATABASE_URL;

const { RentalRepository } = await import("@/server/repositories/rental-repository");
const { withTransaction } = await import("@/server/drizzle/context");
import type { NewRentalRow } from "@/server/repositories/rental-repository";

const repo = new RentalRepository();
const admin = new Client({ connectionString: TEST_DATABASE_URL });
const createdIds: string[] = [];

function newRow(
  overrides: Partial<NewRentalRow> & Pick<NewRentalRow, "id" | "date" | "start" | "end" | "room" | "renterName">,
): NewRentalRow {
  createdIds.push(overrides.id);
  return {
    batchId: randomUUID(),
    createdAt: new Date().toISOString(),
    isCrossMidnight: false,
    renterId: null,
    renterType: "customer",
    purpose: "dance",
    note: "",
    paymentMethod: PaymentMethod.OnSite,
    paymentState: PaymentState.Unpaid,
    amount: 500,
    handler: "測試櫃檯",
    ...overrides,
  };
}

async function readRow(id: string) {
  const { rows } = await admin.query<{ status: string; payment_state: string }>(
    "select status, payment_state from rentals where id = $1",
    [id],
  );
  return rows[0];
}

type ActionOutcome = { ok: true } | { ok: false; reason: "conflicts" | "overlap" | "aborted" };

// Mirrors confirmBooking's room-locked core: find the room, lock it, re-read
// every rental, plan, and write through the guarded transition.
async function confirmLikeAction(id: string): Promise<ActionOutcome> {
  const existing = await repo.findById(id);
  if (!existing) throw new Error(`fixture missing: ${id}`);
  return withTransaction(async () => {
    await repo.lockRoom(existing.room);
    const all = await repo.listAll();
    const rental = all.find((r) => r.id === id);
    if (!rental) throw new Error(`fixture missing after lock: ${id}`);
    const plan = planConfirm(rental, all);
    if (plan.kind === "conflicts") return { ok: false, reason: "conflicts" };
    const applied = await repo.transition(
      rental.id,
      { status: rental.status, paymentState: rental.paymentState },
      { status: plan.nextStatus },
    );
    return applied ? { ok: true } : { ok: false, reason: "aborted" };
  });
}

// Mirrors markBookingPaid's room-locked core: same shape, but the cross-row
// check is findRegisteredOverlaps instead of planConfirm's rivals.
async function markPaidLikeAction(id: string): Promise<ActionOutcome> {
  const existing = await repo.findById(id);
  if (!existing) throw new Error(`fixture missing: ${id}`);
  return withTransaction(async () => {
    await repo.lockRoom(existing.room);
    const all = await repo.listAll();
    const rental = all.find((r) => r.id === id);
    if (!rental) throw new Error(`fixture missing after lock: ${id}`);
    const clash = findRegisteredOverlaps(rental, all);
    if (clash.length) return { ok: false, reason: "overlap" };
    const applied = await repo.transition(
      rental.id,
      { status: rental.status, paymentState: rental.paymentState },
      { status: RentalStatus.Registered, paymentState: PaymentState.Paid },
    );
    return applied ? { ok: true } : { ok: false, reason: "aborted" };
  });
}

// Polls pg_locks until at least `minWaiters` backends are genuinely waiting
// on an advisory lock, so the test proves a real block rather than a timing
// coincidence. Unlike create-booking-batch.db.test.ts's helper, this doesn't
// pin a single pid: the blocked side here runs through RentalRepository's
// pooled transaction, whose backend pid isn't known ahead of time.
async function waitUntilAdvisoryLockWaiters(db: Client, minWaiters: number, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { rows } = await db.query<{ count: string }>(
      "select count(*) from pg_locks where locktype = 'advisory' and not granted",
    );
    if (Number(rows[0].count) >= minWaiters) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("沒有在等待 advisory lock，測試前提不成立（room lock 可能沒有被拿）");
}

beforeAll(async () => {
  await admin.connect();
});

afterAll(async () => {
  if (createdIds.length) await admin.query("delete from rentals where id = any($1::uuid[])", [createdIds]);
  await admin.end();
});

describe("room lock serializes confirm/markPaid", () => {
  it("held lock blocks a concurrent confirm on the same room until it's released", async () => {
    const id = randomUUID();
    const row = newRow({ id, date: "2034-04-01", start: "10:00", end: "11:00", room: "B", renterName: "測試房客A" });
    await repo.create([row]);

    const holder = new Client({ connectionString: TEST_DATABASE_URL });
    await holder.connect();
    try {
      await holder.query("begin");
      await holder.query("select pg_advisory_xact_lock(hashtext('booking_room_' || 'B'))");

      const resultPromise = confirmLikeAction(id);

      // Proves confirmLikeAction's own lockRoom call is genuinely stuck
      // behind the holder's open transaction, not just slow.
      await waitUntilAdvisoryLockWaiters(admin, 1);
      expect(await readRow(id)).toEqual({ status: "pending", payment_state: "unpaid" });

      await holder.query("commit");

      const result = await resultPromise;
      expect(result).toEqual({ ok: true });
      expect(await readRow(id)).toEqual({ status: "registered", payment_state: "unpaid" });
    } finally {
      await holder.end();
    }
  });

  it("two overlapping bookings markPaid'd concurrently: exactly one wins, the other is refused with an overlap, never both registered", async () => {
    const idA = randomUUID();
    const idB = randomUUID();
    const rowA = newRow({
      id: idA,
      date: "2034-04-02",
      start: "14:00",
      end: "15:00",
      room: "B",
      renterName: "測試房客B",
      paymentMethod: PaymentMethod.Transfer,
    });
    const rowB = newRow({
      id: idB,
      date: "2034-04-02",
      start: "14:30",
      end: "15:30",
      room: "B",
      renterName: "測試房客C",
      paymentMethod: PaymentMethod.Transfer,
    });
    await repo.create([rowA, rowB]);
    await admin.query("update rentals set status = 'awaiting_payment' where id = any($1::uuid[])", [[idA, idB]]);

    // Warm the pool up first: the pool's very first couple of queries each
    // open a brand-new physical connection, which takes long enough that
    // the two calls below would run back-to-back instead of overlapping,
    // masking the race this test exists to catch. Two trivial reads ensure
    // at least two live connections are already idle before the real race.
    await Promise.all([repo.findById(idA), repo.findById(idB)]);

    // No manual hold/release needed here: with the real lock, Postgres
    // itself guarantees only one of the two markPaidLikeAction calls holds
    // the room's advisory lock at a time, so this is deterministic even
    // though both are fired at once. Without the lock, the two calls' reads
    // can both land before either write commits, and both would wrongly win.
    const [resultA, resultB] = await Promise.all([markPaidLikeAction(idA), markPaidLikeAction(idB)]);

    const results = [resultA, resultB];
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, reason: "overlap" });

    const [readA, readB] = await Promise.all([readRow(idA), readRow(idB)]);
    const rows = [readA, readB];
    expect(rows.filter((r) => r.status === "registered" && r.payment_state === "paid")).toHaveLength(1);
    expect(rows.filter((r) => r.status === "awaiting_payment" && r.payment_state === "unpaid")).toHaveLength(1);
  });
});
