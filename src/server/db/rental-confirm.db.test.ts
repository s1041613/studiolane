import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { Refused } from "@/server/audit/refusal";
import { TEST_DATABASE_URL } from "@/server/db/test-database-url";
import { classifyDbError } from "@/server/boundary/db-errors";
import { PaymentMethod, PaymentState, RentalStatus } from "@/server/types/home";

// confirm_booking_with_cancellations refuses with its own sentence when a
// row changed meanwhile; the repository passes that on as a refusal the
// person can read, and anything else as a classifiable error.
process.env.DATABASE_URL = TEST_DATABASE_URL;

const { RentalRepository } = await import("@/server/repositories/rental-repository");

const db = new Client({ connectionString: TEST_DATABASE_URL });
const repo = new RentalRepository();
const batchId = randomUUID();
const targetId = randomUUID();
const rivalId = randomUUID();

function rental(id: string) {
  return {
    id,
    batchId,
    createdAt: new Date().toISOString(),
    date: "2031-03-05",
    start: "19:00",
    end: "20:00",
    isCrossMidnight: false,
    room: "B" as const,
    renterId: null,
    renterType: "customer" as const,
    renterName: "測試確認撞單",
    purpose: "dance" as const,
    note: "",
    paymentMethod: PaymentMethod.OnSite,
    paymentState: PaymentState.Unpaid,
    amount: 600,
    handler: "測試櫃檯",
  };
}

beforeAll(async () => {
  await db.connect();
  await repo.create([rental(targetId), rental(rivalId)]);
  // Someone else already cancelled the rival.
  await db.query("update rentals set status = 'cancelled' where id = $1", [rivalId]);
});

afterAll(async () => {
  await db.query("delete from rentals where batch_id = $1", [batchId]);
  await db.end();
});

describe("RentalRepository.confirmWithCancellations", () => {
  it("passes the function's own refusal on as ABORTED, and changes nothing", async () => {
    const thrown = await repo
      .confirmWithCancellations(targetId, RentalStatus.Registered, [{ id: rivalId, note: "" }])
      .catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(Refused);
    expect((thrown as Refused).problem).toEqual({
      kind: "message",
      code: "ABORTED",
      message: "撞單名單裡有預約的狀態已經變了，請重新整理後再確認",
    });
    const { rows } = await db.query("select status from rentals where id = $1", [targetId]);
    expect(rows).toEqual([{ status: "pending" }]);
  });

  it("keeps any other failure as an error the boundary can classify", async () => {
    const thrown = await repo
      .confirmWithCancellations("not-a-uuid", RentalStatus.Registered, [])
      .catch((error: unknown) => error);

    expect(thrown).not.toBeInstanceOf(Refused);
    expect(classifyDbError(thrown).code).toBe("22P02");
  });
});
