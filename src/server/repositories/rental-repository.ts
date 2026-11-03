import { and, eq, sql } from "drizzle-orm";
import { refuse } from "@/server/audit/refusal";
import { classifyDbError } from "@/server/boundary/db-errors";
import { currentDb } from "@/server/drizzle/context";
import { rentals } from "@/server/drizzle/schema/rentals";
import { weekdayZh } from "@/server/logic/date";
import type { BookingConflict } from "@/server/logic/booking-conflicts";
import { PaymentMethod, PaymentState, RentalStatus } from "@/server/types/home";
import type { RentalSummary } from "@/server/types/home";
import { fromNaiveUtcTimestamp, fromStartsEndsAt, paymentMethodLabelOrDash, purposeToLabel, toStartsEndsAt } from "@/server/supabase/codecs";
import type { PaymentMethodCode, PaymentStateCode, PurposeCode, RentalStatusCode } from "@/server/supabase/codecs";

type RentalRow = typeof rentals.$inferSelect;

const ENUM_TO_DOMAIN_STATUS: Record<RentalStatusCode, RentalStatus> = {
  pending: RentalStatus.Pending,
  awaiting_payment: RentalStatus.AwaitingPayment,
  registered: RentalStatus.Registered,
  completed: RentalStatus.Completed,
  postponed: RentalStatus.Postponed,
  cancelled: RentalStatus.Cancelled,
};

const ENUM_TO_DOMAIN_PAYMENT_STATE: Record<PaymentStateCode, PaymentState> = {
  unpaid: PaymentState.Unpaid,
  paid: PaymentState.Paid,
  not_required: PaymentState.NotRequired,
};

const ENUM_TO_DOMAIN_PAYMENT_METHOD: Record<PaymentMethodCode, PaymentMethod> = {
  on_site: PaymentMethod.OnSite,
  transfer: PaymentMethod.Transfer,
};

function rowToRental(row: RentalRow): RentalSummary {
  const startsAt = new Date(row.startsAt);
  const endsAt = new Date(row.endsAt);
  const derived = fromStartsEndsAt({ startsAt, endsAt });

  return {
    id: row.id,
    batchId: row.batchId,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    date: derived.date,
    weekday: weekdayZh(derived.date),
    start: derived.start,
    end: derived.end,
    isCrossMidnight: derived.isCrossMidnight,
    room: row.room,
    handler: row.handler ?? "",
    person: row.renterName,
    renterId: row.renterId,
    renterType: row.renterType,
    purpose: row.purpose,
    purposeLabel: purposeToLabel(row.purpose),
    paymentState: ENUM_TO_DOMAIN_PAYMENT_STATE[row.paymentState],
    status: ENUM_TO_DOMAIN_STATUS[row.status],
    note: row.note ?? "",
    paymentMethod: row.paymentMethod === null ? null : ENUM_TO_DOMAIN_PAYMENT_METHOD[row.paymentMethod],
    paymentMethodLabel: paymentMethodLabelOrDash(row.paymentMethod),
    amount: row.amount,
    createdAt: fromNaiveUtcTimestamp(row.createdAt),
  };
}

// The two columns every allowedActions() branch in src/server/logic/bookings.ts
// switches on. transition() only writes when the row's current pair still
// matches this exact snapshot — the one the caller read just before
// deciding what to write. Guarding on both, not just status, matters for
// Registered: markPaid and markDone are both reached from status ===
// Registered, distinguished only by paymentState, so a status-only guard
// would let a second markPaid race through after the first already flipped
// paymentState.
export type StatusSnapshot = { status: RentalStatus; paymentState: PaymentState };

export type StatusPatch = { status: RentalStatus; paymentState?: PaymentState; note?: string };

export type NewRentalRow = {
  date: string;
  start: string;
  end: string;
  isCrossMidnight: boolean;
  room: "A" | "B";
  renterId: string | null;
  renterType: "roster" | "customer";
  renterName: string;
  purpose: string;
  note: string;
  id: string;
  // null pairs with NotRequired for 0-cost bookings; the DB's
  // rentals_payment_method_matches_state check enforces that.
  paymentMethod: PaymentMethod | null;
  paymentState: PaymentState;
  amount: number;
  batchId: string;
  createdAt: string;
  handler: string;
};

// create_booking_batch expects snake_case keys matching the rentals columns
// its INSERT reads them into.
function rentalRowToBatchJson(row: NewRentalRow) {
  const { startsAt, endsAt } = toStartsEndsAt(row.date, row.start, row.end, row.isCrossMidnight);
  return {
    id: row.id,
    batch_id: row.batchId,
    room: row.room,
    handler: row.handler,
    renter_name: row.renterName,
    renter_id: row.renterId,
    renter_type: row.renterType,
    purpose: row.purpose,
    payment_state: row.paymentState,
    note: row.note,
    payment_method: row.paymentMethod,
    amount: row.amount,
    created_at: row.createdAt,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
  };
}

// Raw shape create_booking_batch's conflicts come back in: snake_case
// starts_at/ends_at instants and the DB status code, before rowToRental
// derives the Taipei-local fields.
type RawConflictRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  renter_name: string;
  status: RentalStatusCode;
};

function rawConflictToBookingConflict(row: RawConflictRow): BookingConflict {
  const { date, start, end } = fromStartsEndsAt({ startsAt: new Date(row.starts_at), endsAt: new Date(row.ends_at) });
  return { id: row.id, date, start, end, renterName: row.renter_name, status: ENUM_TO_DOMAIN_STATUS[row.status] };
}

// One new row blocked by a different renter's registered rental: the id is
// the new row's own (NewRentalRow.id), so the caller can put the field
// error on the right slot, and starts_at/ends_at are the blocking
// registered rival's, for wording the same "HH:MM–HH:MM 已有人預約"
// message checkBooking's unavailableReason gives.
type RawTakenRow = { id: string; starts_at: string; ends_at: string };

const ALREADY_BOOKED_SUFFIX = "已有人預約";

function rawTakenToFieldMessage(row: RawTakenRow): string {
  const { start, end } = fromStartsEndsAt({ startsAt: new Date(row.starts_at), endsAt: new Date(row.ends_at) });
  return `${start}–${end} ${ALREADY_BOOKED_SUFFIX}`;
}

type BatchFunctionResult =
  | { status: "created"; conflicts: [] }
  | { status: "needs_confirm"; conflicts: RawConflictRow[] }
  | { status: "own_overlap"; own_overlap_ids: string[] }
  | { status: "taken"; taken: RawTakenRow[] };

export type CreateBookingBatchResult =
  | { status: "created" }
  | { status: "needs_confirm"; conflicts: BookingConflict[] }
  // ids of the new rows (NewRentalRow.id) that collided with the same
  // renter's own held booking; nothing was inserted.
  | { status: "own_overlap"; ids: string[] }
  // A different renter's registered rental blocks these new rows outright;
  // nothing was inserted, and acknowledging ids can't clear this.
  | { status: "taken"; blocked: Array<{ id: string; message: string }> };

function rentalRowToInsert(row: NewRentalRow): typeof rentals.$inferInsert {
  const { startsAt, endsAt } = toStartsEndsAt(row.date, row.start, row.end, row.isCrossMidnight);

  return {
    id: row.id,
    batchId: row.batchId,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    room: row.room,
    handler: row.handler,
    renterName: row.renterName,
    renterId: row.renterId,
    renterType: row.renterType,
    purpose: row.purpose as PurposeCode,
    paymentState: row.paymentState as PaymentStateCode,
    status: "pending",
    note: row.note,
    paymentMethod: row.paymentMethod as PaymentMethodCode | null,
    amount: row.amount,
    createdAt: row.createdAt,
    updatedAt: row.createdAt,
  };
}

function readFailure(prefix: string, error: unknown): Error {
  return new Error(`${prefix}：${classifyDbError(error).reason}`, { cause: error });
}

// Drizzle wraps the driver error, and a plpgsql `raise exception` puts its
// message deep in the cause chain.
function innermostMessage(error: unknown): string {
  let current = error;
  for (let depth = 0; depth < 10 && current instanceof Error && current.cause instanceof Error; depth++) {
    current = current.cause;
  }
  return current instanceof Error ? current.message : String(current);
}

export class RentalRepository {
  async listAll(): Promise<RentalSummary[]> {
    try {
      const rows = await currentDb().select().from(rentals);
      return rows.map(rowToRental);
    } catch (error) {
      throw readFailure("讀取租借資料失敗", error);
    }
  }

  // Re-read so the details page shows what was actually saved, not just
  // what was submitted.
  async listByBatch(batchId: string): Promise<RentalSummary[]> {
    try {
      const rows = await currentDb().select().from(rentals).where(eq(rentals.batchId, batchId));
      return rows.map(rowToRental);
    } catch (error) {
      throw readFailure("讀取預約明細失敗", error);
    }
  }

  async findById(id: string): Promise<RentalSummary | null> {
    try {
      const [row] = await currentDb().select().from(rentals).where(eq(rentals.id, id));
      return row ? rowToRental(row) : null;
    } catch (error) {
      throw readFailure(`讀取租借 ${id} 失敗`, error);
    }
  }

  // Single source of truth for every status-changing write in this ticket
  // (confirm, markPaid, markDone, postpone, cancel). Returns false, and
  // writes nothing, when `expected` no longer matches the row: a
  // concurrent write got there first. The caller turns that into ABORTED;
  // it never retries here, since retrying would mean re-deciding `patch`
  // against fresh data, which is the action's job, not the repository's.
  async transition(id: string, expected: StatusSnapshot, patch: StatusPatch): Promise<boolean> {
    const set: Partial<typeof rentals.$inferInsert> = { status: patch.status as RentalStatusCode };
    if (patch.paymentState !== undefined) set.paymentState = patch.paymentState as PaymentStateCode;
    if (patch.note !== undefined) set.note = patch.note;
    const written = await currentDb()
      .update(rentals)
      .set(set)
      .where(
        and(
          eq(rentals.id, id),
          eq(rentals.status, expected.status as RentalStatusCode),
          eq(rentals.paymentState, expected.paymentState as PaymentStateCode),
        ),
      )
      .returning({ id: rentals.id });
    return written.length > 0;
  }

  // confirm and markPaid serialize on the room: both read every rental in
  // the room to decide (planConfirm's rivals, findRegisteredOverlaps), and
  // that cross-row read is not itself covered by transition()'s per-row
  // guard. Call inside withTransaction (src/server/drizzle/context.ts) so
  // the lock holds until the caller's re-read and write commit. Same key as
  // create_booking_batch's own room lock (supabase/migrations/0002_create_booking_batch.sql).
  async lockRoom(room: "A" | "B"): Promise<void> {
    await currentDb().execute(sql`select pg_advisory_xact_lock(hashtext('booking_room_' || ${room}))`);
  }

  // Cancels the rivals (each with its own, possibly refund-marked, note)
  // and moves this booking on in one database function call, so a failure
  // leaves every row unchanged.
  async confirmWithCancellations(
    id: string,
    nextStatus: RentalStatus,
    cancellations: Array<{ id: string; note: string }>,
  ): Promise<void> {
    const next = nextStatus as RentalStatusCode;
    try {
      await currentDb().execute(
        sql`select confirm_booking_with_cancellations(${id}::uuid, ${next}::rental_status, ${JSON.stringify(cancellations)}::jsonb)`,
      );
    } catch (error) {
      // P0001 is the function's own raise exception, worded for the
      // person; anything else is the boundary's to classify.
      if (classifyDbError(error).code === "P0001") refuse("ABORTED", innermostMessage(error));
      throw error;
    }
  }

  async create(rows: NewRentalRow[]): Promise<void> {
    if (!rows.length) return;
    await currentDb().insert(rentals).values(rows.map(rentalRowToInsert));
  }

  // submitBooking's all-or-nothing write: create_booking_batch takes an
  // advisory lock on the room, recomputes conflicts against
  // acknowledgedIds, and either inserts every row or none, returning the
  // full conflict list.
  async createBatch(rows: NewRentalRow[], acknowledgedIds: readonly string[]): Promise<CreateBookingBatchResult> {
    if (!rows.length) return { status: "created" };
    const payload = rows.map(rentalRowToBatchJson);
    // drizzle's sql`` expands an interpolated JS array into a parenthesized
    // param list (invalid as uuid[] when empty), so bind a Postgres array
    // literal string and cast instead.
    const result = await currentDb().execute<{ result: BatchFunctionResult }>(
      sql`select create_booking_batch(${JSON.stringify(payload)}::jsonb, ${`{${acknowledgedIds.join(",")}}`}::uuid[]) as result`,
    );
    const batchResult = result.rows[0].result;
    if (batchResult.status === "created") return { status: "created" };
    if (batchResult.status === "own_overlap") return { status: "own_overlap", ids: batchResult.own_overlap_ids };
    if (batchResult.status === "taken") {
      return { status: "taken", blocked: batchResult.taken.map((row) => ({ id: row.id, message: rawTakenToFieldMessage(row) })) };
    }
    return { status: "needs_confirm", conflicts: batchResult.conflicts.map(rawConflictToBookingConflict) };
  }
}
