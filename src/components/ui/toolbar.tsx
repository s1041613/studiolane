import type { ComponentProps } from "react"
import { cn } from "cn"

const TOOLBAR = "flex flex-col gap-3 border-b border-divider-strong px-5 py-3.5 md:flex-row md:items-center"

// DESIGN.md §5.4 內容卡片的工具列: the top row of a content card. Every filter
// (segmented control, search, select, 顯示已停用) sits left as one group 12px
// apart; the action (新增) stands alone on the right. A divider separates it
// from the list below.
//
// `disabled` when the list couldn't be read: nothing on the page can act on
// data it doesn't have, so every control (filters and 新增 alike) stays in
// place at the design system's 50% and the fieldset turns them all off.
export function Toolbar({
  className,
  disabled = false,
  children,
  ...props
}: ComponentProps<"div"> & { disabled?: boolean }) {
  if (!disabled) {
    return (
      <div data-slot="toolbar" className={cn(TOOLBAR, className)} {...props}>
        {children}
      </div>
    )
  }
  return (
    <fieldset
      disabled
      aria-disabled
      data-slot="toolbar"
      // The divider keeps its colour; only the controls fade.
      className={cn("m-0 min-w-0 border-x-0 border-t-0 [&>*]:opacity-50", TOOLBAR, className)}
    >
      {children}
    </fieldset>
  )
}

export function ToolbarFilters({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-wrap items-center gap-3", className)} {...props} />
}

export function ToolbarActions({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex items-center gap-2 md:ml-auto", className)} {...props} />
}
