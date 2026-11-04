"use client"

import * as React from "react"
import { XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

export interface InfoPanelPosition {
  x: number
  y: number
}

interface InfoPanelProps {
  title: string
  open: boolean
  position: InfoPanelPosition
  onPositionChange: (position: InfoPanelPosition) => void
  onClose: () => void
  children: React.ReactNode
}

// A small floating panel for one row's detail, draggable by its title
// strip only (no resize, no traffic lights — Window is for a whole app's
// content, this is for one item). Position is a controlled prop, written
// back only when the drag ends, same pattern as Window's rect.
function InfoPanel({ title, open, position, onPositionChange, onClose, children }: InfoPanelProps) {
  const nodeRef = React.useRef<HTMLDivElement>(null)
  const barRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const node = nodeRef.current
    if (!node || !open) return
    node.style.left = `${position.x}px`
    node.style.top = `${position.y}px`
  }, [position, open])

  React.useEffect(() => {
    const node = nodeRef.current
    const bar = barRef.current
    if (!node || !bar || !open) return

    function onPointerDown(event: PointerEvent) {
      if ((event.target as HTMLElement).closest("button")) return
      const originX = event.clientX
      const originY = event.clientY
      const start = { x: node!.offsetLeft, y: node!.offsetTop }

      function onMove(moveEvent: PointerEvent) {
        const x = start.x + (moveEvent.clientX - originX)
        const y = start.y + (moveEvent.clientY - originY)
        node!.style.left = `${x}px`
        node!.style.top = `${y}px`
      }
      function onUp() {
        document.removeEventListener("pointermove", onMove)
        document.removeEventListener("pointerup", onUp)
        document.body.style.userSelect = ""
        onPositionChange({ x: node!.offsetLeft, y: node!.offsetTop })
      }
      document.body.style.userSelect = "none"
      document.addEventListener("pointermove", onMove)
      document.addEventListener("pointerup", onUp)
    }

    bar.addEventListener("pointerdown", onPointerDown)
    return () => bar.removeEventListener("pointerdown", onPointerDown)
  }, [open, onPositionChange])

  if (!open) return null

  return (
    <div
      ref={nodeRef}
      role="dialog"
      aria-label={title}
      className="absolute z-30 w-72 overflow-hidden rounded-xl bg-white/85 shadow-(--eb-shadow-popover) backdrop-blur-2xl"
    >
      <div
        ref={barRef}
        className="flex h-9 flex-none items-center justify-between border-b border-divider px-3 text-[13px] font-semibold text-foreground select-none"
      >
        <span className="truncate">{title}</span>
        <Button type="button" variant="row-action" size="icon-xs" aria-label={`關閉${title}`} onClick={onClose}>
          <XIcon aria-hidden />
        </Button>
      </div>
      <div className="max-h-[60vh] overflow-y-auto p-3 text-sm">{children}</div>
    </div>
  )
}

export { InfoPanel }
