import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

// DESIGN.md §1 角色: a card is translucent white on the grey page with a white
// hairline and no shadow; an inset is a block inside a card. The variants are
// exported for elements that must keep their own tag (a <ul> list, an <li>).
// Callers' className is for layout only (grid, gap, spacing between children).
const cardVariants = cva("rounded-2xl border border-surface-border bg-surface", {
  variants: {
    // --card-pad mirrors the padding, so a SectionFailure inside can run
    // flush to the card's edges. `none` leaves it unset (0) so a card that
    // pads itself can set its own without two values fighting.
    padding: {
      default: "p-5 [--card-pad:1.25rem]",
      // A page-sized form (預約教室): more room around the fields on desktop.
      roomy: "p-5 [--card-pad:1.25rem] md:p-7 md:[--card-pad:1.75rem]",
      // Lists and tables whose rows carry their own padding.
      none: "",
    },
    // A list page's content card (DESIGN.md §4 列表頁固定高度): on desktop it
    // fills the rest of the window and only its CardScroll / TableFrame part
    // scrolls, so the toolbar above it stays put.
    fill: {
      false: "",
      true: "flex flex-col overflow-hidden md:min-h-0 md:flex-1",
    },
  },
  defaultVariants: { padding: "default", fill: false },
})

const insetVariants = cva("rounded-lg border bg-inset", {
  variants: {
    padding: { default: "p-3", none: "" },
    invalid: { false: "border-inset-border", true: "border-destructive" },
  },
  defaultVariants: { padding: "default", invalid: false },
})

function Card({
  className,
  padding,
  fill,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof cardVariants>) {
  return <div data-slot="card" className={cn(cardVariants({ padding, fill }), className)} {...props} />
}

// The scrolling part of a `fill` card. On a phone the page scrolls instead,
// so there it only scrolls sideways.
function CardScroll({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-scroll"
      className={cn("overflow-x-auto md:min-h-0 md:flex-1 md:overflow-y-auto", className)}
      {...props}
    />
  )
}

function Inset({
  className,
  padding,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof insetVariants>) {
  return <div data-slot="inset" className={cn(insetVariants({ padding }), className)} {...props} />
}

export { Card, CardScroll, Inset, cardVariants, insetVariants }
