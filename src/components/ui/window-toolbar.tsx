import * as React from "react"
import Link from "next/link"
import { cn } from "cn"

// Controls that sit in a Window's title bar (through WindowToolbar): glossy
// pill buttons, a joined back/forward pair, and a rounded search field.

const BUTTON_STYLE: React.CSSProperties = {
  backgroundImage: "linear-gradient(180deg, #fdfeff 0%, #eef1f6 50%, #dfe4ea 51%, #eef1f6 100%)",
  boxShadow: "inset 0 1px 0 #fff, 0 0 0 1px rgba(110,85,60,0.36), 0 1px 1px rgba(80,60,40,0.16)",
}

const ICON_CLASS =
  "size-3.5 fill-none stroke-current stroke-[1.7] [stroke-linecap:round] [stroke-linejoin:round]"

function ToolbarButton({ className, style, type = "button", ...props }: React.ComponentProps<"button">) {
  return (
    <button
      data-slot="toolbar-button"
      type={type}
      className={cn(
        "inline-flex h-6 min-w-7 flex-none cursor-default items-center justify-center gap-[5px] rounded-md px-2 text-[12.5px] whitespace-nowrap text-foreground",
        "active:not-disabled:[background-image:linear-gradient(180deg,#e9dcc9,#f3e9db)] disabled:text-foreground/30 disabled:[&_svg]:opacity-40",
        className
      )}
      style={{ ...BUTTON_STYLE, ...style }}
      {...props}
    />
  )
}

// Two buttons joined edge to edge: only the outer corners are rounded.
function ToolbarButtonGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-none [&>*:first-child]:rounded-r-none [&>*:last-child]:ml-px [&>*:last-child]:rounded-l-none",
        className
      )}
      {...props}
    />
  )
}

function BackIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={ICON_CLASS}>
      <path d="M10 3 5 8l5 5" />
    </svg>
  )
}

function ForwardIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={ICON_CLASS}>
      <path d="m6 3 5 5-5 5" />
    </svg>
  )
}

function ToolbarTitle({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      className={cn("mr-auto min-w-0 truncate text-[13.5px] font-bold text-foreground", className)}
      style={{ textShadow: "0 1px 0 rgba(255,255,255,0.8)" }}
      {...props}
    />
  )
}

interface ToolbarSearchProps extends Omit<React.ComponentProps<"input">, "type"> {
  // Shown as a small × while the field has a value; a link because the
  // field's value lives in the URL, so clearing is a navigation.
  clearHref?: string
  clearLabel?: string
}

function ToolbarSearch({ className, clearHref, clearLabel = "清除搜尋", ...props }: ToolbarSearchProps) {
  return (
    <label className={cn("relative w-[180px] flex-none max-sm:w-[88px]", className)}>
      <svg
        viewBox="0 0 16 16"
        aria-hidden="true"
        className={cn(ICON_CLASS, "pointer-events-none absolute top-[5px] left-[9px] stroke-muted-foreground")}
      >
        <circle cx="7" cy="7" r="4.3" />
        <path d="m10.2 10.2 3.3 3.3" />
      </svg>
      <input
        type="search"
        className="h-6 w-full rounded-full border-0 pr-6 pl-[26px] text-[12.5px] text-foreground placeholder:text-muted-foreground shadow-[inset_0_1px_2px_rgba(80,60,40,0.32),0_0_0_1px_rgba(110,85,60,0.36)] focus:shadow-[inset_0_1px_2px_rgba(80,60,40,0.32),0_0_0_1px_#1d5fb8,0_0_0_4px_rgba(31,111,214,0.35)] focus:outline-none [&::-webkit-search-cancel-button]:appearance-none"
        style={{ background: "#fbfdff" }}
        {...props}
      />
      {clearHref && (
        <Link
          href={clearHref}
          aria-label={clearLabel}
          className="absolute top-[5px] right-[5px] grid size-3.5 cursor-default place-items-center rounded-full text-[10px] leading-none text-white"
          style={{ background: "#b3a291" }}
        >
          ×
        </Link>
      )}
    </label>
  )
}

export { BackIcon, ForwardIcon, ToolbarButton, ToolbarButtonGroup, ToolbarSearch, ToolbarTitle }
