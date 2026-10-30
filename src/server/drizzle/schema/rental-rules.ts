import { sql } from "drizzle-orm";
import { pgTable, check, integer, timestamp, text, uuid, index, time, date } from "drizzle-orm/pg-core";
import { ruleEffect, ruleKind, ruleRoom } from "./enums";

export const rentalRules = pgTable("rental_rules", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  room: ruleRoom().notNull(),
  weekday: integer().notNull(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  reason: text().notNull(),
  onDate: date("on_date"),
  effect: ruleEffect().default("block").notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true, mode: "string" }),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  updatedBy: text("updated_by"),
  kind: ruleKind().default("rental").notNull(),
}, (table) => [
  index("rental_rules_active_idx").using("btree", table.kind.asc().nullsLast(), table.room.asc().nullsLast(), table.weekday.asc().nullsLast()).where(sql`(archived_at IS NULL)`),
  check("rental_rules_weekday_range", sql`(weekday >= 1) AND (weekday <= 7)`),
  check("rental_rules_open_needs_date", sql`(effect = 'block'::rule_effect) OR (on_date IS NOT NULL)`),
  check("rental_rules_ends_after_starts", sql`end_time > start_time`),
  check("rental_rules_on_date_weekday", sql`(on_date IS NULL) OR (EXTRACT(isodow FROM on_date) = (weekday)::numeric)`),
  check("rental_rules_reason_length", sql`(length(btrim(reason)) >= 1) AND (length(btrim(reason)) <= 30)`),
  check("rental_rules_class_hours_block", sql`(kind = 'rental'::rule_kind) OR (effect = 'block'::rule_effect)`),
  check("rental_rules_class_hours_reason", sql`(kind = 'rental'::rule_kind) OR (reason = '上課時段'::text)`),
]).enableRLS();
