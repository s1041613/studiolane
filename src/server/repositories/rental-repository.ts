import { eq, sql } from "drizzle-orm";
import { refuse } from "@/server/audit/refusal";
import { classifyDbError } from "@/server/boundary/db-errors";
import { currentDb } from "@/server/drizzle/context";
import { rentals } from "@/server/drizzle/schema/rentals";
import { weekdayZh } from "@/server/logic/date";
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

// One slot of a submitted BookingDraft, already checked and priced, ready to
// become one row in `rentals`.
export type NewRentalRow = {
  date: string; // ISO yyyy-mm-dd, the slot's start date (Asia/Taipei)
  start: string; // HH:mm
  end: string; // HH:mm
  isCrossMidnight: boolean;
  room: "A" | "B";
  renterId: string | null; // roster.id; null for a customer booking (D5)
  renterType: "roster" | "customer";
  renterName: string; // roster display name, or the customer's typed name
  purpose: string; // Purpose/PurposeCode
  note: string;
  id: string; // uuid, unique per row
  // S-寫入-1/2: null together with NotRequired for 0-cost bookings (the DB's
  // rentals_payment_method_matches_state check enforces the pairing).
  paymentMethod: PaymentMethod | null;
  paymentState: PaymentState;
  amount: number;
  batchId: string; // shared across every slot submitted together
  createdAt: string; // ISO timestamp
  handler: string; // who entered it: the signed-in staff member's name
};

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
    // PaymentState/PaymentMethod enum values are the DB codes already.
    paymentState: row.paymentState as PaymentStateCode,
    status: "pending",
    note: row.note,
    paymentMethod: row.paymentMethod as PaymentMethodCode | null,
    amount: row.amount,
    createdAt: row.createdAt,
    updatedAt: row.createdAt,
  };
}

// Reads keep their prefix for the page; the rest is the classified text,
// and the driver error stays on `cause`.
function readFailure(prefix: string, error: unknown): Error {
  return new Error(`${prefix}：${classifyDbError(error).reason}`, { cause: error });
}

// The innermost error's own message: Drizzle wraps the driver's error, and a
// plpgsql `raise exception` puts its sentence there.
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

  // S-完成-5: the rows of one submission, re-read so the details page shows
  // what was actually saved.
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

  // `note` replaces the whole note when given (postpone/cancel append the
  // refund marker to the existing note before calling this).
  async updateStatus(id: string, status: RentalStatus, note?: string): Promise<void> {
    // RentalStatus enum values are already the DB's English codes
    // (src/server/types/home.ts), so this is a plain type assertion, not a
    // label-to-code lookup.
    const code = status as unknown as RentalStatusCode;
    await currentDb()
      .update(rentals)
      .set(note === undefined ? { status: code } : { status: code, note })
      .where(eq(rentals.id, id));
  }

  // T-確認-4/8: cancels the rivals (each with its own, possibly
  // refund-marked, note) and moves this booking on, all in one database
  // function call: any failure leaves every row unchanged.
  async confirmWithCancellations(
    id: string,
    nextStatus: RentalStatus,
    cancellations: Array<{ id: string; note: string }>,
  ): Promise<void> {
    // RentalStatus enum values are the DB codes already.
    const next = nextStatus as unknown as RentalStatusCode;
    try {
      await currentDb().execute(
        sql`select confirm_booking_with_cancellations(${id}::uuid, ${next}::rental_status, ${JSON.stringify(cancellations)}::jsonb)`,
      );
    } catch (error) {
      // The function's own refusal (raise exception, P0001) is worded for
      // the person; anything else is the boundary's to classify.
      if (classifyDbError(error).code === "P0001") refuse("ABORTED", innermostMessage(error));
      throw error;
    }
  }

  // D7: a single atomic update for the markBookingPaid transition, so
  // status and payment_state can never land out of sync.
  async markPaid(id: string): Promise<void> {
    await currentDb().update(rentals).set({ status: "registered", paymentState: "paid" }).where(eq(rentals.id, id));
  }

  async create(rows: NewRentalRow[]): Promise<void> {
    if (!rows.length) return;
    await currentDb().insert(rentals).values(rows.map(rentalRowToInsert));
  }
}
