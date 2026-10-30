import { eq } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import { refuse } from "@/server/audit/refusal";
import { currentDb, withTransaction } from "@/server/drizzle/context";
import { classifyDbError } from "@/server/boundary/db-errors";
import { roster } from "@/server/drizzle/schema/roster";
import { updateById } from "@/server/repositories/row-writes";
import type { RosterEntry } from "@/server/logic/pricing";
import type { RosterInput } from "@/server/logic/roster-form";

// Only the name is stored (updated_by); any signed-in staff member fits.
type Writer = { name: string };

// Role is fixed once created (B5), so an edit never carries it.
export type RosterPatch = Omit<RosterInput, "role">;

const ENTRY_COLUMNS = {
  id: roster.id,
  name: roster.name,
  email: roster.email,
  phone: roster.phone,
  role: roster.role,
  pricingPlanId: roster.pricingPlanId,
  instagram: roster.instagram,
  archivedAt: roster.archivedAt,
};

type RosterRow = Pick<typeof roster.$inferSelect, keyof typeof ENTRY_COLUMNS>;

function rowToRoster(row: RosterRow): RosterEntry {
  return {
    id: row.id,
    name: row.name,
    email: row.email ?? "",
    phone: row.phone ?? "",
    role: row.role,
    pricingPlanId: row.pricingPlanId,
    instagram: row.instagram ?? "",
    archivedAt: row.archivedAt,
  };
}

const STALE = {
  active: "找不到這位人員，或已被停用，請重新整理",
  archived: "找不到這位人員，或已被啟用，請重新整理",
} as const;

// Reads keep their prefix for the page (loadSection logs it); the
// rest is the classified text, and the driver error stays on `cause`.
function readFailure(prefix: string, error: unknown): Error {
  return new Error(`${prefix}：${classifyDbError(error).reason}`, { cause: error });
}

export class RosterRepository {
  async listAll(): Promise<RosterEntry[]> {
    try {
      const rows = await currentDb().select(ENTRY_COLUMNS).from(roster);
      return rows.map(rowToRoster);
    } catch (error) {
      throw readFailure("讀取人員資料失敗", error);
    }
  }

  // Returns the new id so the page can highlight the row it just added.
  // Inserts are not audited (docs/audit-log/decisions/what-is-recorded.md).
  async create(input: RosterInput, actor: Writer): Promise<string> {
    const [row] = await currentDb()
      .insert(roster)
      .values({
        name: input.name,
        role: input.role,
        pricingPlanId: input.pricingPlanId,
        phone: input.phone,
        email: input.email,
        instagram: input.instagram,
        updatedBy: actor.name,
      })
      .returning({ id: roster.id });
    return row.id;
  }

  // R18 / R19: only the roster row changes; bookings keep their own amount
  // and renter_name snapshot.
  // Only people still active can be edited; one archived meanwhile fails.
  async update(id: string, patch: RosterPatch, actor: Writer): Promise<void> {
    await this.writeOne(id, "active", {
      name: patch.name,
      pricingPlanId: patch.pricingPlanId,
      phone: patch.phone,
      email: patch.email,
      instagram: patch.instagram,
      updatedBy: actor.name,
    });
  }

  // B6: soft delete — nothing in the app removes people (B7).
  async archive(id: string, actor: Writer): Promise<void> {
    await this.writeOne(id, "active", { archivedAt: new Date().toISOString(), updatedBy: actor.name });
  }

  // I-08: a new plan comes along when the old one has been archived.
  async reactivate(id: string, pricingPlanId: string | null, actor: Writer): Promise<void> {
    await this.writeOne(id, "archived", {
      archivedAt: null,
      ...(pricingPlanId === null ? {} : { pricingPlanId }),
      updatedBy: actor.name,
    });
  }

  // The row must still be in the state the page saw (active or archived).
  // Locking it first keeps that true until the write below, which runs in
  // the same transaction. Anything else is a stale page,
  // refused with its own message rather than reported as a success.
  private async writeOne(
    id: string,
    expected: "active" | "archived",
    values: PgUpdateSetSource<typeof roster>,
  ): Promise<void> {
    await withTransaction(async () => {
      const [current] = await currentDb()
        .select({ archivedAt: roster.archivedAt })
        .from(roster)
        .where(eq(roster.id, id))
        .for("update");
      const isActive = current?.archivedAt === null;
      if (!current || isActive !== (expected === "active")) refuse("FAILED_PRECONDITION", STALE[expected]);
      await updateById(roster, roster.id, id, values);
    });
  }
}
