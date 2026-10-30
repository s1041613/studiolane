import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { seal } from "@/lib/result";
import type { NoReactions, Outcome, Problem, Reactions, Sealed, ServerFailure, ServerResult } from "@/lib/result";
import { Refused } from "@/server/audit/refusal";
import { admit, type Access, type ActorFor } from "@/server/boundary/access";
import { errorIdOf, newOperationId } from "@/server/boundary/request";
import { translateThrown } from "@/server/boundary/translate";

export type ActionSpec<A extends Access> = {
  attempted: string;
  access: A;
  effect?: "write" | "read";
  revalidate?: readonly string[];
};

export function withErrorId<R extends Reactions>(problem: Problem<R>, errorId: string): ServerFailure<R> {
  return { ...problem, errorId } as ServerFailure<R>;
}

function logRefusal(errorId: string, attempted: string, problem: { code: string; message: string }): void {
  console.warn(`[op:${errorId}] ${attempted} refused (${problem.code}): ${problem.message}`);
}

function revalidateAll(paths: readonly string[] = []): void {
  for (const path of paths) revalidatePath(path);
}

// For a <form action> read with useActionState, which can't go through
// settle() (and works before JS loads): the plain ServerResult.
export async function runFormAction<A extends Access, T, R extends Reactions = NoReactions>(
  spec: ActionSpec<A>,
  run: (actor: ActorFor<A>) => Promise<Outcome<T, R>>,
): Promise<ServerResult<T, R>> {
  const admitted = await admit(spec.access, spec.attempted);
  if (!admitted.ok) return admitted;
  const errorId = errorIdOf(newOperationId());
  try {
    const outcome = await run(admitted.actor);
    if (outcome.ok) {
      revalidateAll(spec.revalidate);
      return outcome;
    }
    logRefusal(errorId, spec.attempted, outcome.error);
    return { ok: false, error: withErrorId(outcome.error, errorId) };
  } catch (error) {
    // redirect() / notFound() from the body belong to Next.
    unstable_rethrow(error);
    if (error instanceof Refused) {
      logRefusal(errorId, spec.attempted, error.problem);
      return { ok: false, error: withErrorId(error.problem as Problem<R>, errorId) };
    }
    console.error(`[op:${errorId}] ${spec.attempted} failed`, error);
    return { ok: false, error: withErrorId(translateThrown(error, spec.effect).problem, errorId) };
  }
}

export async function runAction<A extends Access, T, R extends Reactions = NoReactions>(
  spec: ActionSpec<A>,
  run: (actor: ActorFor<A>) => Promise<Outcome<T, R>>,
): Promise<Sealed<T, R>> {
  return seal(await runFormAction(spec, run));
}
