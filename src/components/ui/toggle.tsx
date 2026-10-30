"use client"

import { Toggle as TogglePrimitive } from "@base-ui/react/toggle"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

// DESIGN.md §5.4 分段軌道: the rail that holds `track` toggles (or role="tab"
// buttons, which mark the current one with aria-selected).
const trackClassName =
  "inline-flex w-fit gap-1 rounded-lg border border-surface-border bg-white/50 p-1"

const toggleVariants = cva(
  "group/toggle inline-flex items-center justify-center gap-1 rounded-lg text-sm whitespace-nowrap transition-all outline-none focus-visible:ring-[1.5px] focus-visible:ring-foreground disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-[1.5px] aria-invalid:ring-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-transparent font-medium hover:bg-muted aria-pressed:bg-muted",
        // DESIGN.md §5.4 開關方塊 (跨日, 顯示已停用): white with grey text;
        // pressed turns #C7D0D2, dark and 500. No checkbox.
        outline:
          "border border-control-border bg-control text-muted-foreground hover:border-control-border-hover hover:text-foreground aria-pressed:border-transparent aria-pressed:bg-selected aria-pressed:font-medium aria-pressed:text-foreground",
        // DESIGN.md §5.4 分段軌道: a block inside the track; pick one per ToggleGroup.
        track:
          "min-h-[34px] flex-1 rounded-md px-4 text-muted-foreground hover:bg-white/60 hover:text-foreground aria-pressed:bg-selected aria-pressed:font-medium aria-pressed:text-foreground aria-selected:bg-selected aria-selected:font-medium aria-selected:text-foreground",
      },
      size: {
        default:
          "h-8 min-w-8 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        sm: "h-8 min-w-8 rounded-md px-3 text-[0.8rem] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 min-w-9 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        // As tall as a toolbar's search box and select (Input size default).
        control: "h-11 px-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Toggle({
  className,
  variant = "default",
  size = "default",
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants, trackClassName }
