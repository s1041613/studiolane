// The one result format for every server action, page read and form
// validation (E-8). Pure and import-free: src/server/logic, the server
// actions and client components all read it.
//
// The screen decides only by `kind` (show one sentence, mark fields, or list
// what blocks the change). `code` is a stable Google AIP-193 canonical name
// for tests, audit_operations and logs; the screen never branches on it and
// never shows it. `message` is the zh-TW sentence the screen shows as is.

export type ErrorCode =
  | "INVALID_ARGUMENT" // the input itself is wrong (a field, a malformed request)
  | "FAILED_PRECONDITION" // the input is fine, the current state forbids it
  | "NOT_FOUND"
  | "ALREADY_EXISTS" // a create or rename collides with an existing row
  | "ABORTED" // a concurrent change got in first; trying again may work
  | "PERMISSION_DENIED" // signed in, but this page is admin-only; or a login not activated
  | "RESOURCE_EXHAUSTED" // too many attempts (sign-in rate limit)
  | "UNAUTHENTICATED" // signed out, expired or deactivated
  | "UNAVAILABLE" // the database, Google Calendar or the network is down
  | "INTERNAL"; // nothing we expected

// A field-error map, flat since E-19: no producer nests one anymore (booking
// slots, special-course lecturer IGs and purpose role pricing are each
// `field.index`/`field.key` entries on this one level, not a sub-object). A
// field with no error is simply absent, not set to undefined — the
// `| undefined` is for the producers' own `Partial<Record<Field, string>>`
// field maps, which TypeScript sees as "may hold undefined", not for callers
// to assign it.
export type FieldErrorMap = Record<string, string | undefined>;

// Which reactions an operation may ask the screen for besides one sentence,
// which is always possible. `fields` is the field-error map the form puts
// under its inputs; `blockers` is what the screen lists for the person to
// resolve first. A reaction an operation doesn't declare is `never`.
export type Reactions = { fields?: FieldErrorMap; blockers?: unknown };
// The default: an operation that only ever fails with one sentence.
export type NoReactions = Record<never, never>;

type Base = { code: ErrorCode; message: string };

export type MessageProblem = Base & { kind: "message" };
export type FieldsProblem<F extends FieldErrorMap> = Base & { kind: "fields"; fields: F };
export type BlockersProblem<B> = Base & { kind: "blockers"; blockers: B };

// What went wrong, as the screen will react to it. Built by logic, actions
// and repositories; carries no errorId yet.
export type Problem<R extends Reactions = NoReactions> =
  | MessageProblem
  | (R extends { fields: infer F extends FieldErrorMap } ? FieldsProblem<F> : never)
  | (R extends { blockers: infer B } ? BlockersProblem<B> : never);

// Any of the three, whatever an operation declares; what refuse() carries.
export type AnyProblem = MessageProblem | FieldsProblem<FieldErrorMap> | BlockersProblem<unknown>;

export type Ok<T> = { ok: true; data: T };

// What a logic function or an action's body returns. Never crosses the wire.
export type Outcome<T = null, R extends Reactions = NoReactions> = Ok<T> | { ok: false; error: Problem<R> };

// A Problem after the server boundary: errorId is the first 8 characters of
// the operation id, to quote when reporting it (audit_operations, log line).
export type ServerFailure<R extends Reactions = NoReactions> = Problem<R> & { errorId: string };

// A call that never got an answer from our server code; only settle() makes
// these, so errorId is always null.
export type ClientFailure =
  | { kind: "network"; code: "UNAVAILABLE"; message: string; errorId: null }
  | { kind: "stale-client"; code: "FAILED_PRECONDITION"; message: string; errorId: null };

export type Failure<R extends Reactions = NoReactions> = ServerFailure<R> | ClientFailure;

// Any failure, whatever its operation declares: what a component keeps when
// it only shows the sentence (and its error code).
export type AnyFailure = (AnyProblem & { errorId: string }) | ClientFailure;

// What the server boundary produces.
export type ServerResult<T = null, R extends Reactions = NoReactions> = Ok<T> | { ok: false; error: ServerFailure<R> };

// What a component reads: from settle() for an action, or from a page read.
export type Result<T = null, R extends Reactions = NoReactions> = Ok<T> | { ok: false; error: Failure<R> };

declare const sealedBrand: unique symbol;

// A server action's declared return. At runtime it is the plain ServerResult
// object; the type is opaque so a component can't read `.ok` without
// settle(), which is what turns a rejected promise (network down, a deploy
// replaced the action) into a Failure. Forgetting settle() is a type error.
export type Sealed<T = null, R extends Reactions = NoReactions> = { readonly [sealedBrand]: ServerResult<T, R> };

// The server boundary's last step; nothing else should need it.
export function seal<T, R extends Reactions>(result: ServerResult<T, R>): Sealed<T, R> {
  return result as unknown as Sealed<T, R>;
}

// Tests only: read a sealed result without going through settle().
export function unseal<T, R extends Reactions>(sealed: Sealed<T, R>): ServerResult<T, R> {
  return sealed as unknown as ServerResult<T, R>;
}

export function ok(): Ok<null>;
export function ok<T>(data: T): Ok<T>;
export function ok<T>(data?: T): Ok<T | null> {
  return { ok: true, data: data === undefined ? null : data };
}

// One sentence: fail("NOT_FOUND", "找不到這筆預約").
export function fail(code: ErrorCode, message: string): { ok: false; error: MessageProblem } {
  return { ok: false, error: { kind: "message", code, message } };
}

// Every message in a (flat — E-19) field-error map.
export function countFieldErrors(fields: FieldErrorMap): number {
  return Object.values(fields).filter((value) => value !== undefined).length;
}

// Mark fields. The code is always INVALID_ARGUMENT; the sentence defaults to
// how many places need changing.
export function failFields<F extends FieldErrorMap>(fields: F, message?: string): { ok: false; error: FieldsProblem<F> } {
  return {
    ok: false,
    error: {
      kind: "fields",
      code: "INVALID_ARGUMENT",
      message: message ?? `有 ${countFieldErrors(fields)} 個地方需要修改`,
      fields,
    },
  };
}

// List what must be resolved first; `message` is the headline above it.
export function failBlockers<B>(code: ErrorCode, message: string, blockers: B): { ok: false; error: BlockersProblem<B> } {
  return { ok: false, error: { kind: "blockers", code, message, blockers } };
}
