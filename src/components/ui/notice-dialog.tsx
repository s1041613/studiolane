"use client"

import * as React from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

type NoticeDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: React.ReactNode
  // A list or other detail under the description (e.g. the blocking bookings).
  children?: React.ReactNode
  // One optional way forward next to 確定, e.g. 「前往人員名單」.
  action?: { label: string; onClick: () => void }
}

// DESIGN.md §5.10 說明框: tells the user something can't be done (or is done).
// Same frame as the confirm dialog but no ✕ and no 取消: only 確定, plus at
// most one action. Nothing that would do the refused thing is offered.
function NoticeDialog({ open, onOpenChange, title, description, children, action }: NoticeDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          {action ? (
            <>
              <AlertDialogCancel>確定</AlertDialogCancel>
              <AlertDialogAction onClick={action.onClick}>{action.label}</AlertDialogAction>
            </>
          ) : (
            <AlertDialogAction autoFocus onClick={() => onOpenChange(false)}>
              確定
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export { NoticeDialog }
