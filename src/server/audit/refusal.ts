import type { AnyProblem, ErrorCode } from "@/lib/result";

export class Refused extends Error {
  constructor(readonly problem: AnyProblem) {
    super(problem.message);
    this.name = "Refused";
  }
}

export function refuse(code: ErrorCode, message: string): never;
export function refuse(problem: AnyProblem): never;
export function refuse(codeOrProblem: ErrorCode | AnyProblem, message?: string): never {
  throw new Refused(
    typeof codeOrProblem === "string" ? { kind: "message", code: codeOrProblem, message: message ?? "" } : codeOrProblem,
  );
}
