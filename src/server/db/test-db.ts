import { Client } from "pg";
import { TEST_DATABASE_URL } from "@/server/db/test-database-url";

// Every DB test runs inside one transaction that is always rolled back, so
// tests never see each other's rows and leave none behind.
export async function withRollback(run: (db: Client) => Promise<void>): Promise<void> {
  const db = new Client({ connectionString: TEST_DATABASE_URL });
  await db.connect();
  try {
    await db.query("begin");
    await run(db);
  } finally {
    await db.query("rollback").catch(() => {});
    await db.end();
  }
}

// A failed statement aborts the whole transaction; wrapping it in a
// savepoint lets one test assert several rejections in a row.
export async function rejectionOf(db: Client, sql: string, params: unknown[] = []): Promise<string | null> {
  await db.query("savepoint expect_reject");
  try {
    await db.query(sql, params);
    await db.query("release savepoint expect_reject");
    return null;
  } catch (e) {
    await db.query("rollback to savepoint expect_reject");
    return e instanceof Error ? e.message : String(e);
  }
}

export async function insertReturningId(db: Client, sql: string, params: unknown[] = []): Promise<string> {
  const { rows } = await db.query<{ id: string }>(`${sql} returning id`, params);
  return rows[0].id;
}
