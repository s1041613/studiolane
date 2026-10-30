import type { ReactNode } from "react";
import { cn } from "cn";
import type { Failure, Result } from "@/lib/result";
import { ErrorCode } from "@/components/ui/error-code";
import { Table, TableFrame } from "@/components/ui/table";

const FAILURE_FILL = "bg-control bg-[image:linear-gradient(var(--eb-danger-bg),var(--eb-danger-bg))]";

const SPACING = "[--pad:var(--card-pad,0px)] [--inset:var(--failure-inset,max(var(--pad),1.25rem))] px-(--inset)";

const PLACEMENT = {
  body: "-mx-(--pad) -mb-(--pad) flex-1 rounded-b-[inherit] pt-3.5 pb-[calc(var(--inset)-2px)] first:-mt-(--pad) first:rounded-t-[inherit] first:pt-[calc(var(--inset)-2px)]",
  top: "-mx-(--pad) -mt-(--pad) rounded-t-[inherit] pt-[calc(var(--inset)-2px)] pb-3.5",
} as const;

type SectionFailureProps = {
  message?: string;
  failure: Failure;
  placement?: keyof typeof PLACEMENT;
  className?: string;
};

export function SectionFailure({ message = "暫時讀不到", failure, placement = "body", className }: SectionFailureProps) {
  return (
    <div
      role="alert"
      data-slot="section-failure"
      className={cn("@container text-sm", FAILURE_FILL, SPACING, PLACEMENT[placement], className)}
    >
      <p className="text-destructive">{message}</p>
      {failure.errorId && <ErrorCode code={failure.errorId} />}
    </div>
  );
}

// The settings lists' failure pattern. The page hands its board empty data
// plus the failure (dataOrEmpty); the board keeps its toolbar in place with
// <Toolbar disabled> (every control, 新增 included, at 50% and off: nothing
// can act on data it doesn't have) and swaps its body for
// <FailedList>: the table's column heads, if it has any, then the failure.
export function dataOrEmpty<T>(section: Result<T>, empty: T): { data: T; failure: Failure | null } {
  return section.ok ? { data: section.data, failure: null } : { data: empty, failure: section.error };
}

export function FailedList({ message, failure, head }: { message: string; failure: Failure; head?: ReactNode }) {
  return (
    <>
      {head && (
        <TableFrame className="flex-none pb-0 md:flex-none">
          <Table>{head}</Table>
        </TableFrame>
      )}
      <SectionFailure message={message} failure={failure} />
    </>
  );
}
