import { pgEnum } from "drizzle-orm/pg-core";

export const paymentMethod = pgEnum("payment_method", ["on_site", "transfer"]);
export const paymentState = pgEnum("payment_state", ["unpaid", "paid", "not_required"]);
export const purpose = pgEnum("purpose", ["dance", "private_lesson", "performance", "aerobics", "front_desk", "workshop", "photography", "yoga"]);
export const rentalStatus = pgEnum("rental_status", ["pending", "awaiting_payment", "registered", "completed", "postponed", "cancelled"]);
export const renterType = pgEnum("renter_type", ["roster", "customer"]);
export const role = pgEnum("role", ["teacher", "staff", "customer", "guest_teacher"]);
export const room = pgEnum("room", ["A", "B"]);
export const ruleEffect = pgEnum("rule_effect", ["block", "open"]);
export const ruleKind = pgEnum("rule_kind", ["class_hours", "rental"]);
export const ruleRoom = pgEnum("rule_room", ["A", "B", "BOTH"]);
export const purposePricingMode = pgEnum("purpose_pricing_mode", ["price", "discount"]);
