import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

// DESIGN.md §5.7 表格: every table in the app (人員名單, 用途, 批次預約, …).
// The header and every row share one cell padding so columns line up; the
// dividers stay inside the card's 20px side padding.

// The card-side frame: 20px left/right/bottom, scrolls sideways on a phone.
// Inside a `fill` card it is also the part that scrolls down (DESIGN.md §4),
// so pair it with a sticky TableHeader.
function TableFrame({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="table-frame"
      className={cn("overflow-x-auto px-5 pb-5 md:min-h-0 md:flex-1 md:overflow-y-auto", className)}
      {...props}
    />
  )
}

// stack="md": below md every row becomes a two-column card (E9-6). CSS only
// (a group data attribute + Tailwind's max-md:), so server components can
// still render it. The explicit roles keep table semantics where
// display:block/grid would otherwise drop them.
type Stack = "md"

function Table({ className, stack, ...props }: React.ComponentProps<"table"> & { stack?: Stack }) {
  return (
    <table
      data-slot="table"
      data-stack={stack}
      role={stack ? "table" : undefined}
      className={cn("group/table w-full border-collapse text-sm", stack && "max-md:block", className)}
      {...props}
    />
  )
}

// sticky: the header stays in view while the card's content scrolls; it
// needs the opaque surface so rows don't show through.
const tableHeaderVariants = cva("", {
  variants: {
    sticky: { false: "", true: "sticky top-0 z-10 bg-surface-solid" },
  },
  defaultVariants: { sticky: false },
})

function TableHeader({
  className,
  sticky,
  ...props
}: React.ComponentProps<"thead"> & VariantProps<typeof tableHeaderVariants>) {
  return (
    <thead
      data-slot="table-header"
      role="rowgroup"
      className={cn(tableHeaderVariants({ sticky }), "group-data-[stack=md]/table:max-md:hidden", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      role="rowgroup"
      className={cn("[&>tr:last-child]:border-b-0", "group-data-[stack=md]/table:max-md:block", className)}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      role="row"
      className={cn(
        "border-b border-divider-strong transition-colors duration-(--eb-dur-fast) hover:bg-white/55",
        "group-data-[stack=md]/table:max-md:grid group-data-[stack=md]/table:max-md:grid-cols-2 group-data-[stack=md]/table:max-md:gap-x-4 group-data-[stack=md]/table:max-md:gap-y-2.5 group-data-[stack=md]/table:max-md:px-3 group-data-[stack=md]/table:max-md:py-3.5",
        className
      )}
      {...props}
    />
  )
}

// amount: money, right-aligned in tabular figures at 500.
// actions: the row's buttons, right-aligned and as narrow as they are.
const cellAlign = {
  start: "text-left",
  amount: "text-right tabular-nums",
  actions: "w-px text-right whitespace-nowrap",
} as const

type CellAlign = keyof typeof cellAlign

// A column width as a CSS length, e.g. "6.5rem".
type ColumnWidth = `${number}${"rem" | "em" | "ch" | "px" | "%"}`

// The header cell: 13px muted, 14px above and 12px below, then the header line.
// width sizes the whole column; a stacked table hides its header, so the
// width has no effect on the mobile card.
function TableHead({
  className,
  align = "start",
  width,
  style,
  ...props
}: Omit<React.ComponentProps<"th">, "align" | "width"> & { align?: CellAlign; width?: ColumnWidth }) {
  return (
    <th
      data-slot="table-head"
      scope="col"
      role="columnheader"
      className={cn(
        "border-b border-divider-header px-3 pt-3.5 pb-3 text-[13px] font-normal text-muted-foreground",
        cellAlign[align],
        className
      )}
      style={{ width, ...style }}
      {...props}
    />
  )
}

// In a stacked table: title = the card's heading (full width, no label);
// field = label over value; actions = full-width footer, right-aligned.
type StackSlot = "title" | "field" | "actions"
const stackSlot: Record<StackSlot, string> = {
  title: "group-data-[stack=md]/table:max-md:col-span-full",
  field: "",
  actions:
    "group-data-[stack=md]/table:max-md:w-auto group-data-[stack=md]/table:max-md:self-end group-data-[stack=md]/table:max-md:empty:hidden",
}

function TableCell({
  className,
  align = "start",
  label,
  slot = "field",
  children,
  ...props
}: Omit<React.ComponentProps<"td">, "align" | "slot"> & { align?: CellAlign; label?: string; slot?: StackSlot }) {
  return (
    <td
      data-slot="table-cell"
      role="cell"
      className={cn(
        "px-3 py-3.5 align-middle",
        cellAlign[align],
        align === "amount" && "font-medium",
        "group-data-[stack=md]/table:max-md:block group-data-[stack=md]/table:max-md:min-w-0 group-data-[stack=md]/table:max-md:p-0",
        // Numbers stay right-aligned even stacked (DESIGN.md §0.5); every
        // other field reads label-over-value from the left.
        align === "amount"
          ? "group-data-[stack=md]/table:max-md:text-right"
          : "group-data-[stack=md]/table:max-md:text-left",
        stackSlot[slot],
        className
      )}
      {...props}
    >
      {label && slot === "field" && (
        <span className={cn("hidden text-xs font-normal text-muted-foreground", "group-data-[stack=md]/table:max-md:block")}>
          {label}
        </span>
      )}
      {label && slot === "title" && (
        <span className={cn("hidden", "group-data-[stack=md]/table:max-md:sr-only group-data-[stack=md]/table:max-md:block")}>
          {label}{" "}
        </span>
      )}
      {children}
    </td>
  )
}

export { Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow }
