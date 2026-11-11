import { cn } from "cn"

const SPOKE_COUNT = 12

// A 12-spoke "busy" spinner, styled after a classic desktop wait cursor:
// each spoke fades in turn instead of the whole ring rotating. Used by
// PreparingWindow (desktop/preparing-window.tsx) for 準備中; Loader2Icon +
// animate-spin (action-button.tsx) is the other spinner shape in this app,
// for a button's own pending state, not a page-level wait.
function Spinner({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div aria-hidden="true" className={cn("relative size-7", className)} {...props}>
      {Array.from({ length: SPOKE_COUNT }, (_, index) => (
        <span
          key={index}
          className="absolute top-0 left-[46%] h-[28%] w-[8%] animate-spinner-fade rounded-sm bg-text-secondary motion-reduce:animate-none motion-reduce:opacity-50"
          style={{
            transformOrigin: "50% 178%",
            transform: `rotate(${index * 30}deg)`,
            animationDelay: `${(index - SPOKE_COUNT) / SPOKE_COUNT}s`,
          }}
        />
      ))}
    </div>
  )
}

export { Spinner }
