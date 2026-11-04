import { cn } from "cn"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        // A light band sweeps across while content loads; static under reduced motion.
        "animate-skeleton-shimmer rounded-md bg-[linear-gradient(100deg,rgb(120_125_140/.14)_30%,rgb(120_125_140/.04)_50%,rgb(120_125_140/.14)_70%)] bg-size-[200%_100%] motion-reduce:animate-none",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
