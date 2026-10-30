import type { ErrorCode, MessageProblem } from "@/lib/result";
import { AuthError } from "@/server/auth/messages";
import { classifyDbError, type DbErrorKind } from "@/server/boundary/db-errors";

const UNEXPECTED_WRITE = "系統發生未預期的錯誤，資料沒有改變";
const UNEXPECTED_READ = "暫時讀不到資料，請稍後再試一次";

const CODE_OF_DB_KIND: Record<DbErrorKind, ErrorCode> = {
  duplicate: "ALREADY_EXISTS",
  constraint: "INVALID_ARGUMENT",
  conflict: "ABORTED",
  unavailable: "UNAVAILABLE",
  unknown: "INTERNAL",
};

export type Translated = { problem: MessageProblem; detail: Record<string, unknown> };

// The driver's own words: Drizzle's message only repeats the failed query
// and keeps Postgres' error (and its detail) on .cause.
function rawCause(error: unknown): { cause?: string; causeDetail?: string } {
  let inner: unknown = error;
  for (let depth = 0; depth < 10 && inner instanceof Error && inner.cause instanceof Error; depth++) inner = inner.cause;
  if (inner === error || !(inner instanceof Error)) return {};
  const detail = "detail" in inner && typeof inner.detail === "string" ? inner.detail : undefined;
  return { cause: inner.message, ...(detail ? { causeDetail: detail } : {}) };
}

export function translateThrown(error: unknown, effect: "write" | "read" = "write"): Translated {
  if (error instanceof AuthError) {
    return {
      problem: { kind: "message", code: error.code, message: error.message },
      detail: { kind: "auth", message: error.message },
    };
  }
  const db = classifyDbError(error);
  const raw = { message: error instanceof Error ? error.message : String(error), ...rawCause(error) };
  if (db.code === null && db.kind === "unknown") {
    const message = effect === "read" ? UNEXPECTED_READ : UNEXPECTED_WRITE;
    return { problem: { kind: "message", code: "INTERNAL", message }, detail: { kind: "unexpected", ...raw } };
  }
  return {
    problem: { kind: "message", code: CODE_OF_DB_KIND[db.kind], message: db.reason },
    detail: { kind: db.kind, code: db.code, constraint: db.constraint, ...raw },
  };
}
