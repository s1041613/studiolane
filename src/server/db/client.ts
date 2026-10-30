import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// No schema is passed to drizzle(): Drizzle only needs it for the relational
// query API (db.query), which nothing here uses; select/insert/update/delete
// take the table objects directly.
export type Db = NodePgDatabase & { $client: Pool };

// Server-only direct Postgres connection. It connects as the database owner
// and bypasses RLS; the server-only import makes `next build` fail if a
// Client Component imports it. The pool is created on first use, so
// importing this module needs no env at build time.
const POOL = {
  // A few connections serve concurrent requests without using up the
  // pooler's client limit.
  max: 5,
  // Short idle timeout: reuse during bursts, give the connection back soon after.
  idleTimeoutMillis: 5_000,
  // Fail fast when the database is unreachable instead of hanging the request.
  connectionTimeoutMillis: 10_000,
  // Replace any connection after 30 minutes instead of keeping it forever.
  maxLifetimeSeconds: 60 * 30,
} as const;

function logConnectionError(error: Error): void {
  console.error("[db] connection error", error);
}

let cached: Db | null = null;

export function getDb(): Db {
  if (cached) return cached;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }

  const pool = new Pool({ connectionString: url, ...POOL });
  // A dropped connection emits `error` on the pool (idle client) or on the
  // checked-out client; without a listener Node treats it as uncaught and the
  // process crashes. The query in flight still rejects on its own, so these
  // only log, and the pool replaces the broken connection.
  pool.on("error", logConnectionError);
  pool.on("connect", (client) => client.on("error", logConnectionError));
  cached = drizzle(pool);
  return cached;
}
