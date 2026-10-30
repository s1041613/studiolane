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
