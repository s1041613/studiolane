import { sql } from "drizzle-orm";
import { pgTable, check, integer, timestamp, text, foreignKey, uuid, index } from "drizzle-orm/pg-core";
import { paymentMethod, paymentState, purpose, rentalStatus, renterType, room } from "./enums";
import { roster } from "./roster";

export const rentals = pgTable("rentals", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  batchId: uuid("batch_id"),
  room: room().notNull(),
  handler: text(),
  renterName: text("renter_name").notNull(),
  renterId: uuid("renter_id"),
  purpose: purpose().notNull(),
  paymentState: paymentState("payment_state").default("unpaid").notNull(),
  note: text().default(""),
  status: rentalStatus().default("pending").notNull(),
  paymentMethod: paymentMethod("payment_method"),
  amount: integer(),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
  updatedBy: text("updated_by"),
  renterType: renterType("renter_type").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true, mode: "string" }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true, mode: "string" }).notNull(),
}, (table) => [
  index("rentals_room_starts_at_idx").using("btree", table.room.asc().nullsLast(), table.startsAt.asc().nullsLast()),
  foreignKey({
      columns: [table.renterId],
      foreignColumns: [roster.id],
      name: "rentals_renter_id_fkey"
    }),
  check("rentals_renter_type_matches_renter_id", sql`((renter_type = 'roster'::renter_type) AND (renter_id IS NOT NULL)) OR ((renter_type = 'customer'::renter_type) AND (renter_id IS NULL))`),
  check("rentals_amount_non_negative", sql`(amount IS NULL) OR (amount >= 0)`),
  check("rentals_ends_after_starts", sql`ends_at > starts_at`),
  check("rentals_payment_method_matches_state", sql`(payment_method IS NULL) = (payment_state = 'not_required'::payment_state)`),
]).enableRLS();
