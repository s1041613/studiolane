import { sql } from "drizzle-orm";
import { pgTable, check, integer, timestamp, text, uuid, uniqueIndex } from "drizzle-orm/pg-core";
import { role } from "./enums";

export const pricingPlans = pgTable("pricing_plans", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  role: role().notNull(),
  appliesTo: text("applies_to"),
  roomARate: integer("room_a_rate").default(0).notNull(),
  roomBRate: integer("room_b_rate").default(0).notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true, mode: "string" }),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  updatedBy: text("updated_by"),
}, (table) => [
  uniqueIndex("pricing_plans_active_name").using("btree", sql`lower(btrim(applies_to))`).where(sql`(archived_at IS NULL)`),
  uniqueIndex("pricing_plans_one_customer").using("btree", table.role.asc().nullsLast()).where(sql`(role = 'customer'::role)`),
  check("pricing_plans_rates_non_negative", sql`(room_a_rate >= 0) AND (room_b_rate >= 0)`),
  check("pricing_plans_rates_upper", sql`(room_a_rate <= 99999) AND (room_b_rate <= 99999)`),
  check("pricing_plans_customer_active", sql`(role <> 'customer'::role) OR (archived_at IS NULL)`),
]).enableRLS();
