import { eq } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import { refuse } from "@/server/audit/refusal";
import { currentDb, withTransaction } from "@/server/drizzle/context";
import { classifyDbError } from "@/server/boundary/db-errors";
import { purposeRolePricing, purposeSettings } from "@/server/drizzle/schema/purposes";
import { deleteById, updateById } from "@/server/repositories/row-writes";
import type { Purpose } from "@/server/logic/booking";
import type { PurposeChange } from "@/server/logic/purpose-form";
import {
  ARCHIVED_PURPOSE_EDIT_REASON,
  BOOKING_ROLES,
  type BookingRole,
  type PurposeSetting,
  type RolePricing,
} from "@/server/logic/purpose-rules";

type PurposeSettingRow = Pick<typeof purposeSettings.$inferSelect, "purpose" | "allowedRoles" | "archivedAt">;
type RolePricingRow = Pick<
  typeof purposeRolePricing.$inferSelect,
  "id" | "purpose" | "role" | "mode" | "rateA" | "rateB" | "payPercent"
>;
type RolePricingValues = Pick<typeof purposeRolePricing.$inferInsert, "mode" | "rateA" | "rateB" | "payPercent">;

const COLUMNS = {
  purpose: purposeSettings.purpose,
  allowedRoles: purposeSettings.allowedRoles,
  archivedAt: purposeSettings.archivedAt,
};

const PRICING_COLUMNS = {
  id: purposeRolePricing.id,
  purpose: purposeRolePricing.purpose,
  role: purposeRolePricing.role,
  mode: purposeRolePricing.mode,
  rateA: purposeRolePricing.rateA,
  rateB: purposeRolePricing.rateB,
  payPercent: purposeRolePricing.payPercent,
};

// The checks (04 B2/B3) keep the columns of the row's mode non-null and the
// other mode's null, so the casts only narrow what the DB already enforces.
function rowToPricing(row: RolePricingRow): RolePricing {
  return row.mode === "price"
    ? { mode: "price", roomA: row.rateA as number, roomB: row.rateB as number }
    : { mode: "discount", payPercent: row.payPercent as number };
}

function pricingToValues(pricing: RolePricing): RolePricingValues {
  return pricing.mode === "price"
    ? { mode: "price", rateA: pricing.roomA, rateB: pricing.roomB, payPercent: null }
    : { mode: "discount", rateA: null, rateB: null, payPercent: pricing.payPercent };
}

function samePricing(row: RolePricingRow, pricing: RolePricing): boolean {
  const values = pricingToValues(pricing);
  return (
    row.mode === values.mode &&
    row.rateA === values.rateA &&
    row.rateB === values.rateB &&
    row.payPercent === values.payPercent
  );
}

function rowToSetting(row: PurposeSettingRow, pricingRows: readonly RolePricingRow[]): PurposeSetting {
  return {
    purpose: row.purpose,
    // The enum also has guest_teacher; the allowed_roles check keeps it out.
    allowedRoles: row.allowedRoles as BookingRole[],
    rolePricing: Object.fromEntries(
      pricingRows.filter((p) => p.purpose === row.purpose).map((p) => [p.role as BookingRole, rowToPricing(p)]),
    ),
    archivedAt: row.archivedAt,
  };
}

export class PurposeSettingsRepository {
  async listAll(): Promise<PurposeSetting[]> {
    try {
      const db = currentDb();
      const [rows, pricingRows] = await Promise.all([
        db.select(COLUMNS).from(purposeSettings),
        db.select(PRICING_COLUMNS).from(purposeRolePricing),
      ]);
      return rows.map((row) => rowToSetting(row, pricingRows));
    } catch (e) {
      throw new Error(`讀取用途設定失敗：${classifyDbError(e).reason}`, { cause: e });
    }
  }

  // purpose_settings rows are fixed (0014 B5): writes only ever update one of
  // them. Its row is locked first (select … for update), so a concurrent save
  // or archive of the same purpose waits here. Only then is archived_at
  // checked, so an archive committed meanwhile is seen (03 E08), and the
  // pricing rows read are the committed ones, not colliding on (purpose, role)
  // (03 E09). A role's pricing row is then inserted, updated or deleted to
  // match the change; a role that is not open keeps no row (04 B4). All of
  // it runs in one transaction, joining the caller's when there is one.
  update(purpose: Purpose, change: PurposeChange, updatedBy: string): Promise<void> {
    return withTransaction(() => this.updateLocked(purpose, change, updatedBy));
  }

  private async updateLocked(purpose: Purpose, change: PurposeChange, updatedBy: string): Promise<void> {
    const db = currentDb();
    const [locked] = await db
      .select({ archivedAt: purposeSettings.archivedAt })
      .from(purposeSettings)
      .where(eq(purposeSettings.purpose, purpose))
      .for("update");
    if (!locked) refuse("NOT_FOUND", "找不到這個用途的設定");
    if (locked.archivedAt !== null) refuse("FAILED_PRECONDITION", ARCHIVED_PURPOSE_EDIT_REASON);

    await this.updateRow(purpose, { allowedRoles: change.allowedRoles, updatedBy });

    const current = await db
      .select(PRICING_COLUMNS)
      .from(purposeRolePricing)
      .where(eq(purposeRolePricing.purpose, purpose));

    for (const role of BOOKING_ROLES) {
      const row = current.find((p) => p.role === role);
      const next = change.allowedRoles.includes(role) ? change.rolePricing[role] : undefined;
      if (!row && next) {
        await db.insert(purposeRolePricing).values({ purpose, role, ...pricingToValues(next), updatedBy });
      } else if (row && next && !samePricing(row, next)) {
        await updateById(purposeRolePricing, purposeRolePricing.id, row.id, { ...pricingToValues(next), updatedBy });
      } else if (row && !next) {
        await deleteById(purposeRolePricing, purposeRolePricing.id, row.id);
      }
    }
  }

  async setArchived(purpose: Purpose, archived: boolean, updatedBy: string): Promise<void> {
    await this.updateRow(purpose, {
      archivedAt: archived ? new Date().toISOString() : null,
      updatedBy,
    });
  }

  private async updateRow(purpose: Purpose, values: PgUpdateSetSource<typeof purposeSettings>): Promise<void> {
    const updated = await updateById(purposeSettings, purposeSettings.purpose, purpose, values);
    if (!updated) refuse("NOT_FOUND", "找不到這個用途的設定");
  }
}
