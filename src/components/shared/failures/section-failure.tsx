import { cn } from "cn";
import type { Failure, Result } from "@/lib/result";
import { ErrorCode } from "@/components/ui/error-code";

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

export function dataOrEmpty<T>(section: Result<T>, empty: T): { data: T; failure: Failure | null } {
  return section.ok ? { data: section.data, failure: null } : { data: empty, failure: section.error };
}
