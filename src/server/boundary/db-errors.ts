// Turns whatever a database call threw into one of a few kinds an action can
// act on. Drizzle has no error mapping of its own: it wraps every failed
// query in DrizzleQueryError and puts the driver's error on `.cause`
// (drizzle-orm discussion #916), so the SQLSTATE code is never on the
// thrown error itself. Kinds follow PostgreSQL's SQLSTATE classes
// (Appendix A, "PostgreSQL Error Codes"); connection failures that never
// reached Postgres come from node-postgres and Node's sockets instead.

export type DbErrorKind = "unavailable" | "duplicate" | "constraint" | "conflict" | "unknown";

export type DbFailure = {
  kind: DbErrorKind;
  reason: string;
  code: string | null;
  constraint: string | null;
  cause: unknown;
};

const REASON: Record<DbErrorKind, string> = {
  duplicate: "這筆資料已經存在，不能重複新增",
  constraint: "資料不符合規則，請檢查後再試一次",
  conflict: "剛好有其他人同時在修改，請再試一次",
  unavailable: "資料庫暫時連不上，請稍後再試一次",
  unknown: "資料庫發生錯誤，請再試一次",
};

// Node socket errors raised while connecting or mid-query.
const SOCKET_CODES = new Set(["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EPIPE"]);

// node-postgres raises these without a code (pg/lib/client.js, pg-pool).
const CONNECTION_MESSAGES = [
  "Connection terminated",
  "Client has encountered a connection error",
  "Client was closed and is not queryable",
  "timeout exceeded when trying to connect",
];

function kindOfSqlState(code: string): DbErrorKind {
  if (code === "23505" || code === "23P01") return "duplicate"; // unique / exclusion violation
  if (code.startsWith("23")) return "constraint"; // integrity constraint violation
  if (code === "40001" || code === "40P01") return "conflict"; // serialization failure / deadlock
  if (code.startsWith("08")) return "unavailable"; // connection exception
  if (code === "53300") return "unavailable"; // too_many_connections
  if (code === "57P01" || code === "57P02" || code === "57P03") return "unavailable"; // shutdown / cannot connect now
  return "unknown";
}

function isSqlState(code: unknown): code is string {
  return typeof code === "string" && /^[0-9A-Z]{5}$/.test(code);
}

function rootCause(error: unknown): unknown {
  let current = error;
  for (let depth = 0; depth < 10; depth++) {
    if (current instanceof Error && "code" in current && current.code) return current;
    const next = current instanceof Error ? current.cause : undefined;
    if (next === undefined) return current;
    current = next;
  }
  return current;
}

function hasConnectionMessage(error: unknown): boolean {
  for (let current = error, depth = 0; current instanceof Error && depth < 10; current = current.cause, depth++) {
    if (CONNECTION_MESSAGES.some((message) => current instanceof Error && current.message.startsWith(message))) {
      return true;
    }
  }
  return false;
}

export function classifyDbError(error: unknown): DbFailure {
  const root = rootCause(error);
  const code = root instanceof Error && "code" in root && typeof root.code === "string" ? root.code : null;
  const constraint =
    root instanceof Error && "constraint" in root && typeof root.constraint === "string" ? root.constraint : null;

  // Socket codes first: EPIPE is also five capitals, like a SQLSTATE.
  let kind: DbErrorKind = "unknown";
  if (code !== null && SOCKET_CODES.has(code)) kind = "unavailable";
  else if (isSqlState(code)) kind = kindOfSqlState(code);
  else if (hasConnectionMessage(error)) kind = "unavailable";

  return { kind, reason: REASON[kind], code, constraint, cause: error };
}
