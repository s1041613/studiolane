"use client"

import * as React from "react"
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"
import { cn } from "cn"

// DESIGN.md §5.8-adjacent: same floating-panel language as the popover
// menu, but for a passive hint instead of a choice. base-ui's tooltip is
// hover/focus-only by design (it never opens from a touch tap), which is
// what a `(hover: none)` device needs here — nothing extra to wire up.
// The open delay lives on Provider, not Root, so each Tooltip carries its
// own Provider rather than asking every call site to wrap one.
function Tooltip({ delay = 450, ...props }: TooltipPrimitive.Root.Props & { delay?: number }) {
  return (
    <TooltipPrimitive.Provider delay={delay}>
      <TooltipPrimitive.Root data-slot="tooltip" {...props} />
    </TooltipPrimitive.Provider>
  )
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  side = "top",
  sideOffset = 6,
  ...props
}: TooltipPrimitive.Popup.Props & Pick<TooltipPrimitive.Positioner.Props, "side" | "sideOffset" | "align">) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner side={side} sideOffset={sideOffset} className="isolate z-50">
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "rounded-md bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-(--eb-shadow-popover) outline-hidden data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
            className
          )}
          {...props}
        />
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipContent, TooltipTrigger }
