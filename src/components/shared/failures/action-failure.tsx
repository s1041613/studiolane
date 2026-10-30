import { cn } from "cn";
import type { Failure, FieldErrorMap, Problem } from "@/lib/result";
import type { RentalSummary } from "@/server/types/home";
import { ErrorCode } from "@/components/ui/error-code";
import { AffectedRentals } from "@/components/shared/rentals/affected-rentals";

export type FailureBlockers = { details?: readonly string[]; conflicts?: readonly RentalSummary[] };

type ShownReactions = { fields: FieldErrorMap; blockers: FailureBlockers };

// Everything ActionFailure can show: a failure from settle() (errorId is null
// when the request never reached the server), or a refusal the screen worked
// out before calling the server (e.g. 停用's impact check), which has no
// errorId at all. Neither of the last two shows 錯誤代碼.
export type ShownFailure = Failure<ShownReactions> | Problem<ShownReactions>;

type ActionFailureProps = {
  failure: ShownFailure;
  variant?: "banner" | "inline" | "notice";
  className?: string;
};

function errorIdOf(failure: ShownFailure): string | null {
  return "errorId" in failure ? failure.errorId : null;
}

export function ActionFailure({ failure, variant = "banner", className }: ActionFailureProps) {
  const errorId = errorIdOf(failure);
  const blockers = failure.kind === "blockers" ? failure.blockers : null;

  if (variant === "inline") {
    return (
      <span data-slot="action-failure" className={cn("mt-2 block text-[13px] text-destructive", className)}>
        {failure.message}
        {errorId && <ErrorCode code={errorId} />}
      </span>
    );
  }

  if (variant === "notice") {
    if (!errorId && !blockers) return null;
    return (
      <div data-slot="action-failure" className={cn("space-y-2 text-sm", className)}>
        {errorId && <ErrorCode code={errorId} copyable={false} />}
        {blockers && <BlockerLists blockers={blockers} />}
      </div>
    );
  }

  return (
    <div
      role="alert"
      data-slot="action-failure"
      className={cn("rounded-md bg-danger-bg p-3 text-sm text-destructive", blockers && "space-y-1", className)}
    >
      {blockers ? <p className="font-medium">{failure.message}</p> : failure.message}
      {errorId && <ErrorCode code={errorId} />}
      {blockers && <BlockerLists blockers={blockers} />}
    </div>
  );
}

function BlockerLists({ blockers }: { blockers: FailureBlockers }) {
  const { details = [], conflicts = [] } = blockers;
  return (
    <>
      {details.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5">
          {details.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      <AffectedRentals rentals={conflicts} />
    </>
  );
}
