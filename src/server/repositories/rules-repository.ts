import { refuse } from "@/server/audit/refusal";
import { currentDb } from "@/server/drizzle/context";
import { classifyDbError } from "@/server/boundary/db-errors";
import { rentalRules } from "@/server/drizzle/schema/rental-rules";
import { updateById } from "@/server/repositories/row-writes";
import type { RentalRule, RuleInput } from "@/server/logic/booking-rules";

type RuleRoom = (typeof rentalRules.room.enumValues)[number];

const COLUMNS = {
  id: rentalRules.id,
  kind: rentalRules.kind,
  room: rentalRules.room,
  weekday: rentalRules.weekday,
  onDate: rentalRules.onDate,
  startTime: rentalRules.startTime,
  endTime: rentalRules.endTime,
  effect: rentalRules.effect,
  reason: rentalRules.reason,
  archivedAt: rentalRules.archivedAt,
};

type RuleRow = Pick<typeof rentalRules.$inferSelect, keyof typeof COLUMNS>;

function toRoom(room: RuleRoom): RentalRule["room"] {
  return room === "BOTH" ? null : room;
}

function fromRoom(room: RentalRule["room"]): RuleRoom {
  return room ?? "BOTH";
}

function toHHmm(dbTime: string): string {
  // Postgres `time` comes back as "HH:mm:ss" (24:00 as "24:00:00"); the app only needs "HH:mm".
  return dbTime.slice(0, 5);
}

function rowToRule(row: RuleRow): RentalRule {
  return {
    id: row.id,
    kind: row.kind,
    room: toRoom(row.room),
    weekday: row.weekday,
    onDate: row.onDate,
    start: toHHmm(row.startTime),
    end: toHHmm(row.endTime),
    effect: row.effect,
    reason: row.reason,
    archivedAt: row.archivedAt,
  };
}

function inputToRow(input: RuleInput) {
  return {
    kind: input.kind,
    room: fromRoom(input.room),
    weekday: input.weekday,
    onDate: input.onDate,
    startTime: input.start,
    endTime: input.end,
    effect: input.effect,
    reason: input.reason,
  };
}

// One DB row is one rule (one line on the settings screen), archived ones
// included: booking checks skip them, the settings page shows them on demand.
// Writes let database errors through for runAudited to classify.
export class RulesRepository {
  async listAll(): Promise<RentalRule[]> {
    try {
      const rows = await currentDb().select(COLUMNS).from(rentalRules);
      return rows.map(rowToRule);
    } catch (e) {
      throw new Error(`讀取租借時段失敗：${classifyDbError(e).reason}`, { cause: e });
    }
  }

  // I-02: a weekly rule ticked for several weekdays arrives as several rows,
  // inserted in one statement so they land together or not at all.
  async create(inputs: readonly RuleInput[], updatedBy: string): Promise<RentalRule[]> {
    const rows = await currentDb()
      .insert(rentalRules)
      .values(inputs.map((input) => ({ ...inputToRow(input), updatedBy })))
      .returning(COLUMNS);
    return rows.map(rowToRule);
  }

  async update(id: string, input: RuleInput, updatedBy: string): Promise<RentalRule> {
    return this.patch(id, { ...inputToRow(input), updatedBy });
  }

  // archivedAt: an ISO timestamp to archive, null to reactivate.
  async setArchived(id: string, archivedAt: string | null, updatedBy: string): Promise<RentalRule> {
    return this.patch(id, { archivedAt, updatedBy });
  }

  private async patch(id: string, values: Partial<typeof rentalRules.$inferInsert>): Promise<RentalRule> {
    const updated = await updateById(rentalRules, rentalRules.id, id, values);
    if (!updated) refuse("NOT_FOUND", "找不到這筆租借時段，請重新整理");
    return rowToRule(updated);
  }
}
