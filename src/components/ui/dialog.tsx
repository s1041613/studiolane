"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

// DESIGN.md §5.10 遮罩: pale grey with a 4px blur. Shared with AlertDialog.
const dialogOverlayClass =
  "fixed inset-0 isolate z-50 bg-dialog-overlay backdrop-blur-[4px] duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"

// DESIGN.md §5.10 容器: 560px (at most the viewport − 32), opaque #F3F5F6,
// white hairline, radius 20, padding 24, at most 100vh − 48. Shared with
// AlertDialog so both read as the same surface.
const dialogPopupClass =
  "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-48px)] w-[calc(100%-2rem)] max-w-[560px] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-2xl border border-white bg-dialog p-6 text-sm text-popover-foreground shadow-(--eb-shadow-dialog) duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(dialogOverlayClass, className)}
      {...props}
    />
  )
}

// A dialog with the ✕ needs no 取消 in its footer (DESIGN.md §5.11); only a
// confirmation without ✕ (AlertDialog) keeps one.
function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(dialogPopupClass, className)}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="row-action"
                className="absolute top-5 right-5"
                size="icon"
              />
            }
          >
            <XIcon />
            <span className="sr-only">關閉</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      // pr-10 keeps a long title clear of the ✕.
      className={cn("flex shrink-0 flex-col gap-1 pr-10", className)}
      {...props}
    />
  )
}

// The part that scrolls when the content is taller than the dialog; the
// header and footer stay put.
function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-body"
      className={cn("-mx-6 min-h-0 flex-1 overflow-y-auto px-6", className)}
      {...props}
    />
  )
}

// DESIGN.md §5.10 底部: same fill as the dialog, a divider above, actions on
// the right 8px apart. `start` holds the bottom-left delete (§5.11).
function DialogFooter({
  className,
  start,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  start?: React.ReactNode
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-6 -mb-6 flex shrink-0 items-center gap-2 border-t border-divider-strong px-6 py-4",
        className
      )}
      {...props}
    >
      {start}
      <div className="ml-auto flex items-center gap-2">{children}</div>
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-[17px] leading-snug font-medium", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-[13px] text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
  dialogOverlayClass,
  dialogPopupClass,
}
