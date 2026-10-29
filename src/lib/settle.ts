import { unstable_isUnrecognizedActionError, unstable_rethrow } from "next/navigation";
import type { ClientFailure, Reactions, Result, Sealed, ServerResult } from "@/lib/result";

export const NETWORK_FAILURE: ClientFailure = {
  kind: "network",
  code: "UNAVAILABLE",
  message: "連線失敗，請再試一次",
  errorId: null,
};

// The page was loaded before a deploy that removed or renamed the action.
export const STALE_CLIENT_FAILURE: ClientFailure = {
  kind: "stale-client",
  code: "FAILED_PRECONDITION",
  message: "頁面已更新，請重新整理後再試一次",
  errorId: null,
};

// The only way a component reads a server action's result. A rejected call
// resolves to a ClientFailure instead, so every call site has something to
// show when the request never got an answer. Next's own control flow is
// handed back untouched: an action that calls redirect() rejects on the
// client with NEXT_REDIRECT, and Next navigates once it propagates.
export async function settle<T, R extends Reactions>(call: Promise<Sealed<T, R>>): Promise<Result<T, R>> {
  try {
    return (await call) as unknown as ServerResult<T, R>;
  } catch (error) {
    unstable_rethrow(error);
    if (unstable_isUnrecognizedActionError(error)) return { ok: false, error: STALE_CLIENT_FAILURE };
    console.warn("[action] did not reach the server", error);
    return { ok: false, error: NETWORK_FAILURE };
  }
}
