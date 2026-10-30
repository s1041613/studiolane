import { sql } from "drizzle-orm";
import { pgTable, check, integer, timestamp, text, unique, uuid } from "drizzle-orm/pg-core";
import { purpose, purposePricingMode, role } from "./enums";

export const purposeSettings = pgTable("purpose_settings", {
  purpose: purpose().primaryKey().notNull(),
  allowedRoles: role("allowed_roles").array().notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true, mode: "string" }),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  updatedBy: text("updated_by"),
}, () => [
  check("purpose_settings_allowed_roles", sql`(cardinality(allowed_roles) > 0) AND (allowed_roles <@ ARRAY['teacher'::role, 'staff'::role, 'customer'::role])`),
]).enableRLS();

// One row = a role's special
// pricing for a purpose; no row means the renter's own plan (方案價格).
// The uuid id is the audit key (auditedUpdate needs a single-column primary
// key); (purpose, role) is the real identity.
export const purposeRolePricing = pgTable("purpose_role_pricing", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  purpose: purpose().notNull().references(() => purposeSettings.purpose),
  role: role().notNull(),
  mode: purposePricingMode().notNull(),
  rateA: integer("rate_a"),
  rateB: integer("rate_b"),
  payPercent: integer("pay_percent"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  updatedBy: text("updated_by"),
}, (table) => [
  // B1: one row per purpose and role; guest teachers never rent.
  unique("purpose_role_pricing_purpose_role").on(table.purpose, table.role),
  check("purpose_role_pricing_role", sql`role = ANY (ARRAY['teacher'::role, 'staff'::role, 'customer'::role])`),
  // B2 / B3: the columns of the other mode stay null. coalesce as in 0014:
  // `null between 0 and 99999` is null, which a check would let through.
  check("purpose_role_pricing_price", sql`(mode <> 'price'::purpose_pricing_mode) OR (COALESCE((((rate_a >= 0) AND (rate_a <= 99999)) AND ((rate_b >= 0) AND (rate_b <= 99999))), false) AND (pay_percent IS NULL))`),
  check("purpose_role_pricing_discount", sql`(mode <> 'discount'::purpose_pricing_mode) OR (COALESCE(((pay_percent >= 10) AND (pay_percent <= 99)), false) AND (rate_a IS NULL) AND (rate_b IS NULL))`),
]).enableRLS();
