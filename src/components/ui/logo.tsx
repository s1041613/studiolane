import { cn } from "cn";

export function Logo({ className }: { className?: string }) {
  return (
    <span aria-label="Studiolane" className={cn("flex items-center text-xl font-medium tracking-tight", className)}>
      s<span aria-hidden className="mx-[0.05em] size-[0.4em] rounded-full bg-lime-dot" />l
    </span>
  );
}
