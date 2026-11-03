"use client"

import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"
import { cn } from "cn"
import { ChevronDownIcon, CheckIcon, ChevronUpIcon } from "lucide-react"

const Select = SelectPrimitive.Root

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn("scroll-my-1 p-1", className)}
      {...props}
    />
  )
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn("flex flex-1 text-left", className)}
      {...props}
    />
  )
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: SelectPrimitive.Trigger.Props & {
  size?: "sm" | "default"
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "flex w-full min-w-0 items-center justify-between gap-1.5 rounded-lg border border-control-border bg-control py-2 pr-3 pl-3.5 hover:border-control-border-hover text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-foreground focus-visible:ring-1 focus-visible:ring-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-[1.5px] aria-invalid:ring-destructive data-placeholder:text-muted-foreground data-[size=default]:h-11 data-[size=sm]:h-8 data-[size=sm]:rounded-md *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon
        render={
          <ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />
        }
      />
    </SelectPrimitive.Trigger>
  )
}

// Rows show the highlight only once the list is driven by keys: the popup
// marks itself on the first arrow key, and a fresh popup starts unmarked.
const KEYBOARD_NAV_KEYS = new Set(["ArrowDown", "ArrowUp", "Home", "End"])

// The panel's radius is the item radius plus the panel padding (12 + 6 ≈ the
// panel's rounded-xl), so a highlighted first or last row follows its corner.
function SelectContent({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  alignItemWithTrigger = true,
  onKeyDown,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset" | "alignItemWithTrigger"
  >) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className="isolate z-50"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          data-align-trigger={alignItemWithTrigger}
          onKeyDown={(event) => {
            if (KEYBOARD_NAV_KEYS.has(event.key)) event.currentTarget.dataset.keyboardNav = ""
            onKeyDown?.(event)
          }}
          className={cn("relative isolate z-50 max-h-(--available-height) w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-xl bg-popover p-1.5 text-popover-foreground shadow-(--eb-shadow-popover) duration-100 data-[align-trigger=true]:animate-none data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95", className )}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({
  className,
  ...props
}: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn("px-1.5 py-1 text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

// DESIGN.md §0.4 選中＝變色，不加符號: a single select marks the chosen row
// with the selected fill, no check mark. `indicator="checkbox"` is §5.4
// 下拉複選: a 14px box in front of every option, dark when ticked, and the
// ticked row on a light grey fill. Real hover gets the lighter grey, and so
// does the keyboard's row once arrows move it: Base UI highlights the first
// item on open, which read as a stray selection.
// Base UI marks a selected item with a bare `data-selected`, so these use
// `data-[selected]`: shadcn's `data-selected:` variant means `="true"` (cmdk).
function SelectItem({
  className,
  children,
  indicator = "none",
  ...props
}: SelectPrimitive.Item.Props & { indicator?: "none" | "checkbox" }) {
  const isCheckbox = indicator === "checkbox"
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "group/select-item relative flex w-full cursor-default items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm outline-hidden select-none not-last:mb-1 not-data-[selected]:hover:bg-inset in-data-[keyboard-nav]:not-data-[selected]:data-[highlighted]:bg-inset data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        isCheckbox ? "data-[selected]:bg-inset" : "data-[selected]:bg-selected data-[selected]:font-medium",
        className
      )}
      {...props}
    >
      {isCheckbox && (
        <span
          aria-hidden
          className="grid size-3.5 shrink-0 place-items-center rounded-[4px] border border-control-border-hover bg-control text-primary-foreground group-data-[selected]/select-item:border-primary group-data-[selected]/select-item:bg-primary"
        >
          <CheckIcon className="size-3! opacity-0 group-data-[selected]/select-item:opacity-100" />
        </span>
      )}
      <SelectPrimitive.ItemText className="flex flex-1 shrink-0 gap-2 whitespace-nowrap">
        {children}
      </SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({
  className,
  ...props
}: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("pointer-events-none -mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn(
        "top-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <ChevronUpIcon
      />
    </SelectPrimitive.ScrollUpArrow>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn(
        "bottom-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <ChevronDownIcon
      />
    </SelectPrimitive.ScrollDownArrow>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
