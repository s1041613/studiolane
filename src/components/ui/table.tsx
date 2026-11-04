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

// density="compact": a window's list pane — 35px single-line rows, no row
// dividers, rounded blue selection, small header. Read by the cells below
// through the table's group data attribute, so it stays CSS only too.
type Density = "comfortable" | "compact"

function Table({
  className,
  stack,
  density = "comfortable",
  ...props
}: React.ComponentProps<"table"> & { stack?: Stack; density?: Density }) {
  return (
    <table
      data-slot="table"
      data-stack={stack}
      data-density={density}
      role={stack ? "table" : undefined}
      className={cn("group/table w-full border-collapse text-sm", stack && "max-md:block", className)}
      {...props}
    />
  )
}

// sticky: the header stays in view while the card's content scrolls; it
// needs the opaque surface so rows don't show through.
const tableHeaderVariants = cva("group-data-[density=compact]/table:bg-[#eef2f7] group-data-[density=compact]/table:shadow-[0_1px_0_rgba(120,95,70,0.16)]", {
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
        "group-data-[density=compact]/table:border-b-0 group-data-[density=compact]/table:hover:bg-[rgba(120,95,70,0.06)]",
        "group-data-[density=compact]/table:aria-selected:bg-[rgba(31,111,214,0.18)] group-data-[density=compact]/table:aria-selected:hover:bg-[rgba(31,111,214,0.18)]",
        "group-data-[density=compact]/table:[&>td:first-child]:rounded-l-[5px] group-data-[density=compact]/table:[&>td:last-child]:rounded-r-[5px]",
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
export type ColumnWidth = `${number}${"rem" | "em" | "ch" | "px" | "%"}`

export type SortDirection = "ascending" | "descending"

// A clickable header: `direction` is set on the column the rows are sorted
// by, which then reads bold with a ▲/▼.
interface HeadSort {
  direction: SortDirection | null
  onSort: () => void
}

// The header cell: 13px muted, 14px above and 12px below, then the header line.
// width sizes the whole column; a stacked table hides its header, so the
// width has no effect on the mobile card.
function TableHead({
  className,
  align = "start",
  width,
  style,
  sort,
  children,
  ...props
}: Omit<React.ComponentProps<"th">, "align" | "width"> & { align?: CellAlign; width?: ColumnWidth; sort?: HeadSort }) {
  return (
    <th
      data-slot="table-head"
      scope="col"
      role="columnheader"
      aria-sort={sort ? (sort.direction ?? "none") : undefined}
      className={cn(
        "border-b border-divider-header px-3 pt-3.5 pb-3 text-[13px] font-normal text-muted-foreground",
        "group-data-[density=compact]/table:border-b-0 group-data-[density=compact]/table:px-2.5 group-data-[density=compact]/table:pt-[5px] group-data-[density=compact]/table:pb-1 group-data-[density=compact]/table:text-[11.5px]",
        sort?.direction && "font-semibold text-foreground",
        cellAlign[align],
        className
      )}
      style={{ width, ...style }}
      {...props}
    >
      {sort ? (
        <button
          type="button"
          onClick={sort.onSort}
          className={cn(
            "inline-flex cursor-default items-center gap-[5px] hover:text-foreground",
            align === "amount" && "flex-row-reverse"
          )}
        >
          {children}
          <span aria-hidden="true" className="text-[8px] text-link">
            {sort.direction === "ascending" ? "▲" : sort.direction === "descending" ? "▼" : ""}
          </span>
        </button>
      ) : (
        children
      )}
    </th>
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
        "group-data-[density=compact]/table:h-[35px] group-data-[density=compact]/table:px-3 group-data-[density=compact]/table:py-1",
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
