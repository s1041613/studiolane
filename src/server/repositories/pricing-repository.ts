import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import { failFields } from "@/lib/result";
import { refuse } from "@/server/audit/refusal";
import { currentDb } from "@/server/drizzle/context";
import { classifyDbError } from "@/server/boundary/db-errors";
import { pricingPlans } from "@/server/drizzle/schema/pricing";
import { updateById } from "@/server/repositories/row-writes";
import type { PricingPlan } from "@/server/logic/pricing";
import {
  CUSTOMER_PLAN_ARCHIVE_ERROR,
  CUSTOMER_PLAN_TAKEN,
  REACTIVATE_NAME_TAKEN,
  sameNameError,
} from "@/server/logic/pricing-form";
import type { RoleCode } from "@/server/supabase/codecs";

// Name and rates, the only things a plan's dialog can change (role is fixed,
// B5). `updatedBy` comes from requireStaff().
export type PlanWriteInput = {
  name: string;
  roomARate: number;
  roomBRate: number;
  updatedBy: string;
};

export type NewPlanInput = PlanWriteInput & { role: RoleCode };

function writeColumns(input: PlanWriteInput) {
  return {
    appliesTo: input.name,
    roomARate: input.roomARate,
    roomBRate: input.roomBRate,
    updatedBy: input.updatedBy,
  };
}

// A plan saved by someone else between the action's re-read and this write
// trips the DB's own rule; say it the way the form would have. The failed
// statement has aborted the transaction, and refuse() rolls it back. Any
// other error is the boundary's to classify and record.
async function explainingConstraints<T>(write: () => Promise<T>, explain: Record<string, () => never>): Promise<T> {
  try {
    return await write();
  } catch (e) {
    const { constraint } = classifyDbError(e);
    if (constraint !== null && constraint in explain) explain[constraint]();
    throw e;
  }
}

export class PricingRepository {
  // A failed read's message goes to the log (loadSection), so it carries
  // the classified Chinese reason rather than the SQL Drizzle puts in its own.
  async listAll(): Promise<PricingPlan[]> {
    try {
      return await currentDb()
        .select({
          id: pricingPlans.id,
          category: pricingPlans.role,
          appliesTo: pricingPlans.appliesTo,
          roomARate: pricingPlans.roomARate,
          roomBRate: pricingPlans.roomBRate,
          archivedAt: pricingPlans.archivedAt,
        })
        .from(pricingPlans);
    } catch (e) {
      throw new Error(`讀取價格方案失敗：${classifyDbError(e).reason}`, { cause: e });
    }
  }

  // Inserts are not audited (docs/audit-log/modules/audited-write.md).
  async create(input: NewPlanInput): Promise<string> {
    const [row] = await explainingConstraints(
      () =>
        currentDb()
          .insert(pricingPlans)
          .values({ role: input.role, ...writeColumns(input) })
          .returning({ id: pricingPlans.id }),
      {
        pricing_plans_active_name: () => refuse(failFields({ name: sameNameError(input.name) }).error),
        pricing_plans_one_customer: () => refuse(failFields({ role: CUSTOMER_PLAN_TAKEN }).error),
      },
    );
    return row.id;
  }

  async update(id: string, input: PlanWriteInput): Promise<void> {
    await explainingConstraints(() => this.updateRow(id, writeColumns(input)), {
      pricing_plans_active_name: () => refuse(failFields({ name: sameNameError(input.name) }).error),
    });
  }

  // Soft delete (B6–B8): plans are never removed, only archived.
  async setArchived(id: string, archived: boolean, updatedBy: string): Promise<void> {
    await explainingConstraints(
      () => this.updateRow(id, { archivedAt: archived ? new Date().toISOString() : null, updatedBy }),
      archived
        ? { pricing_plans_customer_active: () => refuse("FAILED_PRECONDITION", CUSTOMER_PLAN_ARCHIVE_ERROR) }
        : { pricing_plans_active_name: () => refuse("ALREADY_EXISTS", REACTIVATE_NAME_TAKEN) },
    );
  }

  private async updateRow(id: string, values: PgUpdateSetSource<typeof pricingPlans>): Promise<void> {
    const updated = await updateById(pricingPlans, pricingPlans.id, id, values);
    if (!updated) refuse("NOT_FOUND", "找不到這個方案，請重新整理");
  }
}
