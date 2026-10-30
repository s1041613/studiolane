import { redirect, unstable_rethrow } from "next/navigation";
import type { ServerFailure } from "@/lib/result";
import { AuthError } from "@/server/auth/messages";
import { requireStaff, type StaffActor } from "@/server/auth/require-staff";
import { errorIdOf, newOperationId, requestInfoOrNone } from "@/server/boundary/request";
import { translateThrown } from "@/server/boundary/translate";

export type Access = "anyone" | "staff" | { adminPage: string };

export type ActorFor<A extends Access> = A extends "anyone" ? null : StaffActor;

export type Admission<A extends Access> = { ok: true; actor: ActorFor<A> } | { ok: false; error: ServerFailure };

async function loginPageFor(): Promise<string> {
  const { page } = await requestInfoOrNone();
  const params = new URLSearchParams(page ? { next: page } : {});
  params.set("reason", "expired");
  return `/login?${params.toString()}`;
}

export async function admit<A extends Access>(access: A, attempted: string): Promise<Admission<A>> {
  if (access === "anyone") return { ok: true, actor: null as ActorFor<A> };
  try {
    const actor = await requireStaff({ page: typeof access === "object" ? access.adminPage : undefined });
    return { ok: true, actor: actor as ActorFor<A> };
  } catch (error) {
    unstable_rethrow(error);
    const errorId = errorIdOf(newOperationId());
    console.warn(`[op:${errorId}] ${attempted} refused before sign-in check passed`, error);
    if (error instanceof AuthError && error.code === "UNAUTHENTICATED") redirect(await loginPageFor());
    return { ok: false, error: { ...translateThrown(error).problem, errorId } };
  }
}
