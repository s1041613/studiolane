import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Client } from "pg";
import { TEST_DATABASE_URL } from "@/server/db/test-database-url";
import { PaymentMethod, PaymentState, RentalStatus } from "@/server/types/home";
import { toStartsEndsAt } from "@/server/supabase/codecs";

// create_booking_batch, the real function against the local database.
// (a)-(d) go through RentalRepository.createBatch, the same path
// submitBooking uses; (e) drives the function directly over two raw
// connections to prove the room's advisory lock serialises two concurrent
// submits for the same free slot. Fictional names only.
process.env.DATABASE_URL = TEST_DATABASE_URL;

const { RentalRepository } = await import("@/server/repositories/rental-repository");
import type { NewRentalRow } from "@/server/repositories/rental-repository";

const repo = new RentalRepository();
const admin = new Client({ connectionString: TEST_DATABASE_URL });
const createdIds: string[] = [];

function newRow(
  overrides: Partial<NewRentalRow> & Pick<NewRentalRow, "date" | "start" | "end" | "renterName">,
): NewRentalRow {
  const id = randomUUID();
  createdIds.push(id);
  return {
    id,
    batchId: randomUUID(),
    createdAt: new Date().toISOString(),
    isCrossMidnight: false,
    room: "A",
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

// create_booking_batch's own jsonb row shape (snake_case), for the two
// raw-connection test where the repository's pool can't give each side its
// own held-open transaction.
function rawBatchRow(input: { id: string; date: string; start: string; end: string; renterName: string }) {
  const { startsAt, endsAt } = toStartsEndsAt(input.date, input.start, input.end, false);
  return {
    id: input.id,
    batch_id: randomUUID(),
    room: "A",
    handler: "測試櫃檯",
    renter_name: input.renterName,
    renter_id: null,
    renter_type: "customer",
    purpose: "dance",
    payment_state: "unpaid",
    note: "",
    payment_method: "on_site",
    amount: 500,
    created_at: new Date().toISOString(),
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
  };
}

// Polls pg_locks until `pid`'s backend is actually waiting on an advisory
// lock, so the test proves a genuine block rather than a timing coincidence.
async function waitUntilBlockedOnAdvisoryLock(db: Client, pid: number, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { rows } = await db.query("select 1 from pg_locks where locktype = 'advisory' and pid = $1 and not granted", [pid]);
    if (rows.length > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("第二個連線沒有在等待 advisory lock，測試前提不成立");
}

beforeAll(async () => {
  await admin.connect();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterAll(async () => {
  if (createdIds.length) await admin.query("delete from rentals where id = any($1::uuid[])", [createdIds]);
  await admin.end();
  vi.restoreAllMocks();
});

describe("create_booking_batch", () => {
  it("(a) 空時段：直接寫入", async () => {
    const row = newRow({ date: "2032-07-01", start: "10:00", end: "11:00", renterName: "測試租借人A" });
    const result = await repo.createBatch([row], []);
    expect(result).toEqual({ status: "created" });
    const { rows } = await admin.query("select status from rentals where id = $1", [row.id]);
    expect(rows).toEqual([{ status: "pending" }]);
  });

  it("(b) 別人佔用中的重疊預約 → needs_confirm，插入 0 筆", async () => {
    const rival = newRow({ date: "2032-07-02", start: "10:00", end: "11:00", renterName: "測試租借人B" });
    await repo.createBatch([rival], []);

    const mine = newRow({ date: "2032-07-02", start: "10:30", end: "11:30", renterName: "測試租借人C" });
    const result = await repo.createBatch([mine], []);

    expect(result).toEqual({
      status: "needs_confirm",
      conflicts: [
        { id: rival.id, date: "2032-07-02", start: "10:00", end: "11:00", renterName: "測試租借人B", status: RentalStatus.Pending },
      ],
    });
    const { rows } = await admin.query("select 1 from rentals where id = $1", [mine.id]);
    expect(rows).toHaveLength(0);
  });

  it("別人已登記的重疊預約 → taken，插入 0 筆，帶對手的時段", async () => {
    const rival = newRow({ date: "2032-07-11", start: "10:00", end: "11:00", renterName: "測試租借人P" });
    await repo.createBatch([rival], []);
    await admin.query("update rentals set status = 'registered' where id = $1", [rival.id]);

    const mine = newRow({ date: "2032-07-11", start: "10:30", end: "11:30", renterName: "測試租借人Q" });
    const result = await repo.createBatch([mine], []);

    expect(result).toEqual({ status: "taken", blocked: [{ id: mine.id, message: "10:00–11:00 已有人預約" }] });
    const { rows } = await admin.query("select 1 from rentals where id = $1", [mine.id]);
    expect(rows).toHaveLength(0);
  });

  it("已經確認過的對手變成已登記 → 帶著 acknowledgedIds 重送也還是 taken，插入 0 筆", async () => {
    const rival = newRow({ date: "2032-07-12", start: "10:00", end: "11:00", renterName: "測試租借人R" });
    await repo.createBatch([rival], []);

    const mine = newRow({ date: "2032-07-12", start: "10:30", end: "11:30", renterName: "測試租借人S" });
    const firstAttempt = await repo.createBatch([mine], []);
    expect(firstAttempt).toEqual({
      status: "needs_confirm",
      conflicts: [
        { id: rival.id, date: "2032-07-12", start: "10:00", end: "11:00", renterName: "測試租借人R", status: RentalStatus.Pending },
      ],
    });

    // The person acknowledged rival while it was still pending; before the
    // resend reaches the lock, someone else confirms it.
    await admin.query("update rentals set status = 'registered' where id = $1", [rival.id]);
    const resend = await repo.createBatch([mine], [rival.id]);

    expect(resend).toEqual({ status: "taken", blocked: [{ id: mine.id, message: "10:00–11:00 已有人預約" }] });
    const { rows } = await admin.query("select 1 from rentals where id = $1", [mine.id]);
    expect(rows).toHaveLength(0);
  });

  it("別人待付款的重疊預約 → needs_confirm，不是 taken", async () => {
    const rival = newRow({ date: "2032-07-13", start: "10:00", end: "11:00", renterName: "測試租借人T" });
    await repo.createBatch([rival], []);
    await admin.query("update rentals set status = 'awaiting_payment' where id = $1", [rival.id]);

    const mine = newRow({ date: "2032-07-13", start: "10:30", end: "11:30", renterName: "測試租借人U" });
    const result = await repo.createBatch([mine], []);

    expect(result).toEqual({
      status: "needs_confirm",
      conflicts: [
        { id: rival.id, date: "2032-07-13", start: "10:00", end: "11:00", renterName: "測試租借人T", status: RentalStatus.AwaitingPayment },
      ],
    });
    const { rows } = await admin.query("select 1 from rentals where id = $1", [mine.id]);
    expect(rows).toHaveLength(0);
  });

  it("(c) 同一筆帶著已確認的衝突 id 重送 → 寫入", async () => {
    const rival = newRow({ date: "2032-07-03", start: "10:00", end: "11:00", renterName: "測試租借人D" });
    await repo.createBatch([rival], []);

    const mine = newRow({ date: "2032-07-03", start: "10:30", end: "11:30", renterName: "測試租借人E" });
    const result = await repo.createBatch([mine], [rival.id]);

    expect(result).toEqual({ status: "created" });
    const { rows } = await admin.query("select status from rentals where id = $1", [mine.id]);
    expect(rows).toEqual([{ status: "pending" }]);
  });

  it("(d) 對方已取消的預約不算衝突", async () => {
    const rival = newRow({ date: "2032-07-04", start: "10:00", end: "11:00", renterName: "測試租借人F" });
    await repo.createBatch([rival], []);
    await admin.query("update rentals set status = 'cancelled' where id = $1", [rival.id]);

    const mine = newRow({ date: "2032-07-04", start: "10:30", end: "11:30", renterName: "測試租借人G" });
    const result = await repo.createBatch([mine], []);

    expect(result).toEqual({ status: "created" });
  });

  it("(f) 同一個人連續送出同一個空時段：第二次得到 own_overlap，插入 0 筆", async () => {
    const date = "2032-07-06";
    const first = newRow({ date, start: "10:00", end: "11:00", renterName: "測試租借人J" });
    await repo.createBatch([first], []);

    const second = newRow({ date, start: "10:00", end: "11:00", renterName: "測試租借人J" });
    const result = await repo.createBatch([second], []);

    expect(result).toEqual({ status: "own_overlap", ids: [second.id] });
    const { rows } = await admin.query("select 1 from rentals where id = $1", [second.id]);
    expect(rows).toHaveLength(0);
  });

  it("(g) 同一批自己的時段互相重疊 → 丟出例外，什麼都不寫（booking-validation 已經擋過一次，這裡是防呆）", async () => {
    const overlapA = newRow({ date: "2032-07-08", start: "10:00", end: "11:00", renterName: "測試租借人L" });
    const overlapB = newRow({ date: "2032-07-08", start: "10:30", end: "11:30", renterName: "測試租借人L" });

    await expect(repo.createBatch([overlapA, overlapB], [])).rejects.toThrow();

    const { rows } = await admin.query("select 1 from rentals where id = any($1::uuid[])", [[overlapA.id, overlapB.id]]);
    expect(rows).toHaveLength(0);
  });

  it("(h) 兩個連線同時用同一個人送出同一個空時段：先到的那筆先寫入，後到的得到 own_overlap", async () => {
    const date = "2032-07-09";
    const clientA = new Client({ connectionString: TEST_DATABASE_URL });
    const clientB = new Client({ connectionString: TEST_DATABASE_URL });
    const firstId = randomUUID();
    const secondId = randomUUID();
    createdIds.push(firstId, secondId);

    await clientA.connect();
    await clientB.connect();
    try {
      await clientA.query("begin");
      await clientB.query("begin");

      // A's own transaction is still open: it has committed nothing, but
      // its advisory lock on room A is held until it does.
      const firstResult = await clientA.query("select create_booking_batch($1::jsonb, $2::uuid[]) as result", [
        JSON.stringify([rawBatchRow({ id: firstId, date, start: "16:00", end: "17:00", renterName: "測試租借人M" })]),
        [],
      ]);
      expect(firstResult.rows[0].result).toEqual({ status: "created", conflicts: [] });

      const { rows: pidRows } = await clientB.query<{ pid: number }>("select pg_backend_pid() as pid");
      const secondPromise = clientB.query("select create_booking_batch($1::jsonb, $2::uuid[]) as result", [
        JSON.stringify([rawBatchRow({ id: secondId, date, start: "16:00", end: "17:00", renterName: "測試租借人M" })]),
        [],
      ]);

      // Proves the lock actually serialises the two calls, not just that B
      // happened to run after A: B is still blocked while A's transaction
      // is open.
      await waitUntilBlockedOnAdvisoryLock(admin, pidRows[0].pid);

      await clientA.query("commit");

      const secondResult = await secondPromise;
      expect(secondResult.rows[0].result).toEqual({ status: "own_overlap", own_overlap_ids: [secondId] });
      await clientB.query("commit");

      const { rows } = await admin.query("select id, status from rentals where id = any($1::uuid[]) order by renter_name", [
        [firstId, secondId],
      ]);
      expect(rows).toEqual([{ id: firstId, status: "pending" }]);
    } finally {
      await clientA.end();
      await clientB.end();
    }
  });

  it("(e) 兩個連線同時送出同一個空時段：先到的那筆先寫入，鎖讓後到的等它交易結束才看到", async () => {
    const date = "2032-07-05";
    const clientA = new Client({ connectionString: TEST_DATABASE_URL });
    const clientB = new Client({ connectionString: TEST_DATABASE_URL });
    const firstId = randomUUID();
    const secondId = randomUUID();
    createdIds.push(firstId, secondId);

    await clientA.connect();
    await clientB.connect();
    try {
      await clientA.query("begin");
      await clientB.query("begin");

      // A's own transaction is still open: it has committed nothing, but
      // its advisory lock on room A is held until it does.
      const firstResult = await clientA.query("select create_booking_batch($1::jsonb, $2::uuid[]) as result", [
        JSON.stringify([rawBatchRow({ id: firstId, date, start: "14:00", end: "15:00", renterName: "測試租借人H" })]),
        [],
      ]);
      expect(firstResult.rows[0].result).toEqual({ status: "created", conflicts: [] });

      const { rows: pidRows } = await clientB.query<{ pid: number }>("select pg_backend_pid() as pid");
      const secondPromise = clientB.query("select create_booking_batch($1::jsonb, $2::uuid[]) as result", [
        JSON.stringify([rawBatchRow({ id: secondId, date, start: "14:00", end: "15:00", renterName: "測試租借人I" })]),
        [],
      ]);

      // Proves the lock actually serialises the two calls, not just that B
      // happened to run after A: B is still blocked while A's transaction
      // is open.
      await waitUntilBlockedOnAdvisoryLock(admin, pidRows[0].pid);

      await clientA.query("commit");

      const secondResult = await secondPromise;
      expect(secondResult.rows[0].result).toEqual({
        status: "needs_confirm",
        conflicts: [
          { id: firstId, starts_at: expect.any(String), ends_at: expect.any(String), renter_name: "測試租借人H", status: "pending" },
        ],
      });
      await clientB.query("commit");

      const { rows } = await admin.query("select id, status from rentals where id = any($1::uuid[]) order by renter_name", [
        [firstId, secondId],
      ]);
      expect(rows).toEqual([{ id: firstId, status: "pending" }]);
    } finally {
      await clientA.end();
      await clientB.end();
    }
  });
});
