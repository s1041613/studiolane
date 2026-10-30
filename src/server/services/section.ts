import { unstable_rethrow } from "next/navigation";
import { ok, type Result } from "@/lib/result";
import { errorIdOf, newOperationId } from "@/server/boundary/request";
import { withErrorId } from "@/server/boundary/run-action";
import { translateThrown } from "@/server/boundary/translate";

export async function loadSection<T>(read: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await read());
  } catch (error) {
    // redirect() / notFound() and Next's dynamic-rendering signals.
    unstable_rethrow(error);
    const errorId = errorIdOf(newOperationId());
    console.error(`[op:${errorId}] page read failed`, error);
    return { ok: false, error: withErrorId(translateThrown(error, "read").problem, errorId) };
  }
}
