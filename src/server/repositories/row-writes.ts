import { eq } from "drizzle-orm";
import type { PgColumn, PgTable, PgUpdateSetSource } from "drizzle-orm/pg-core";
import { auditedWrite } from "@/server/audit/audited-write";
import { currentDb } from "@/server/drizzle/context";

// How repositories change or delete one row by its key. Each write goes
// through the audited-write seam, so the audit log can be added there later
// without touching the repositories.

// Returns the updated row, or null when no row has this key.
export async function updateById<T extends PgTable>(
  table: T,
  key: PgColumn,
  id: string,
  values: PgUpdateSetSource<T>,
): Promise<T["$inferSelect"] | null> {
  const rows = await auditedWrite(() => currentDb().update(table).set(values).where(eq(key, id)).returning());
  return (rows as T["$inferSelect"][])[0] ?? null;
}

// Returns whether a row was deleted.
export async function deleteById(table: PgTable, key: PgColumn, id: string): Promise<boolean> {
  const rows = await auditedWrite(() => currentDb().delete(table).where(eq(key, id)).returning());
  return rows.length > 0;
}
