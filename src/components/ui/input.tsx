"use client"

import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { useFieldControl } from "@/components/ui/field"

// DESIGN.md §5.3: every input, select trigger and picker trigger shares this
// look. Exported so custom triggers (roster/time comboboxes, native selects)
// reuse it instead of copying classes.
const controlVariants = cva(
  // Focus: the border turns #202020 plus a 1px ring, not a thick halo.
  "min-w-0 rounded-lg border text-sm transition-colors outline-none placeholder:text-placeholder focus-visible:border-foreground focus-visible:ring-1 focus-visible:ring-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-[1.5px] aria-invalid:ring-destructive",
  {
    variants: {
      variant: {
        default: "border-control-border bg-control hover:border-control-border-hover",
        // A field that can't be filled in yet (「請先填完每天的時間」).
        pending: "border-dashed border-pending-border bg-transparent text-muted-foreground",
      },
      size: {
        default: "h-11 px-3.5",
        // Time fields and controls inside table rows.
        sm: "h-[34px] rounded-md px-2.5",
        // A field holding chips that may wrap (日期多選): grows past 44px.
        auto: "min-h-11 px-1.5 py-1.5",
      },
      width: {
        full: "w-full",
        // DESIGN.md §8.2: 開始／結束 are 92px so they sit on one row with 跨日.
        time: "w-[92px]",
        // DESIGN.md §5.3 搜尋框: one width site-wide, never stretched by its parent.
        search: "w-full sm:w-[280px]",
      },
    },
    defaultVariants: { variant: "default", size: "default", width: "full" },
  }
)

type ControlVariantProps = VariantProps<typeof controlVariants>

// `controlSize`, not `size`: <input size> is a native attribute.
function Input({
  className,
  type,
  variant,
  controlSize,
  controlWidth,
  id,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  ...props
}: React.ComponentProps<"input"> & {
  variant?: ControlVariantProps["variant"]
  controlSize?: ControlVariantProps["size"]
  controlWidth?: ControlVariantProps["width"]
}) {
  // E-19: a control inside a Field gets id/aria-invalid/aria-describedby
  // from it via context. This has to be read here, inside Input's own
  // render — not spread from the call site as `{...useFieldControl()}` onto
  // <Input>, which runs in the *caller's* render (e.g. a dialog's), not as a
  // descendant of the Field it's visually nested under, so it never sees
  // the Provider and silently reads nothing. An explicit id/aria-* prop
  // still wins, for the few controls outside a Field or needing an override.
  const field = useFieldControl()
  return (
    <InputPrimitive
      type={type}
      id={id ?? field.id}
      aria-invalid={ariaInvalid ?? field["aria-invalid"]}
      aria-describedby={ariaDescribedBy ?? field["aria-describedby"]}
      data-slot="input"
      className={cn(
        controlVariants({ variant, size: controlSize, width: controlWidth }),
        "py-1 file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export { Input, controlVariants }
