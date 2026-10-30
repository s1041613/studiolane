import { sql } from "drizzle-orm";
import { pgTable, check, timestamp, text, foreignKey, uuid } from "drizzle-orm/pg-core";
import { role } from "./enums";
import { pricingPlans } from "./pricing";

export const roster = pgTable("roster", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  name: text().notNull(),
  email: text(),
  phone: text(),
  role: role().notNull(),
  pricingPlanId: uuid("pricing_plan_id").notNull(),
  instagram: text(),
  archivedAt: timestamp("archived_at", { withTimezone: true, mode: "string" }),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  updatedBy: text("updated_by"),
}, (table) => [
  foreignKey({
      columns: [table.pricingPlanId],
      foreignColumns: [pricingPlans.id],
      name: "roster_pricing_plan_id_fkey"
    }).onDelete("restrict"),
  check("roster_instagram_handle", sql`instagram ~ '^[A-Za-z0-9._]{1,30}$'::text`),
  check("roster_phone_mobile", sql`(phone IS NULL) OR (phone ~ '^09[0-9]{8}$'::text)`),
]).enableRLS();
