"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { animate, motion, AnimatePresence, useReducedMotion } from "motion/react";
import { cn } from "cn";
import { TrafficLights } from "@/components/ui/traffic-lights";

export interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface WindowProps {
  title: string;
  open: boolean;
  rect: WindowRect;
  onRectChange: (rect: WindowRect) => void;
  onClose: () => void;
  minWidth?: number;
  minHeight?: number;
  // The top edge can't be dragged above this (the menu bar's height).
  topInset?: number;
  // Rendered at the title bar's right end, after the title's own
  // `marginRight: auto` has pushed everything past it there.
  titleAccessory?: React.ReactNode;
  // When set, the title bar leaves room for the content's own controls
  // (rendered through WindowToolbar) instead of showing `title`.
  toolbar?: boolean;
  // Tween to a new `rect` from outside (e.g. the window growing to show
  // more content) instead of jumping. Drags and resizes stay live.
  animateRect?: boolean;
  children: React.ReactNode;
}

const DEFAULT_MIN_WIDTH = 640;
const DEFAULT_MIN_HEIGHT = 360;
const RECT_TWEEN = { duration: 0.42, ease: [0.22, 1, 0.36, 1] } as const;

const ToolbarSlotContext = React.createContext<HTMLElement | null>(null);

// Puts its children into the enclosing Window's title bar. Outside a
// Window (unit tests, a page without the desktop shell) it renders in place.
function WindowToolbar({ children }: { children: React.ReactNode }) {
  const slot = React.useContext(ToolbarSlotContext);
  if (!slot) return <div className="flex h-10 items-center gap-2 px-3">{children}</div>;
  return createPortal(children, slot);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

// A floating, draggable, resizable panel with file-browser-style chrome
// (traffic lights, centered title). Position and size are read from `rect`
// and written back only when a drag or resize ends; while one is in
// progress this mutates the DOM node directly instead of round-tripping
// through React state. All of that imperative DOM work is wired up inside
// an effect — the escape hatch the React Compiler expects for anything that
// isn't pure rendering.
function Window({
  title,
  open,
  rect,
  onRectChange,
  onClose,
  minWidth = DEFAULT_MIN_WIDTH,
  minHeight = DEFAULT_MIN_HEIGHT,
  topInset = 0,
  titleAccessory,
  toolbar = false,
  animateRect = false,
  children,
}: WindowProps) {
  const [toolbarSlot, setToolbarSlot] = React.useState<HTMLElement | null>(null);
  const nodeRef = React.useRef<HTMLDivElement>(null);
  const titleBarRef = React.useRef<HTMLDivElement>(null);
  const eastRef = React.useRef<HTMLDivElement>(null);
  const southRef = React.useRef<HTMLDivElement>(null);
  const cornerRef = React.useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  // Follows `rect` (a reopen, or the store syncing back after a drag ends).
  // Not involved while a drag/resize is live — that mutates the node
  // directly, below.
  // The first layout after opening never tweens, so a reopen lands in place.
  const placedRef = React.useRef(false);
  React.useEffect(() => {
    const node = nodeRef.current;
    if (!node || !open) {
      placedRef.current = false;
      return;
    }
    const target = { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` };
    if (!animateRect || reduceMotion || !placedRef.current) {
      Object.assign(node.style, target);
      placedRef.current = true;
      return;
    }
    const tween = animate(node, target, RECT_TWEEN);
    return () => tween.stop();
  }, [rect, open, animateRect, reduceMotion]);

  // Esc closes the front window.
  React.useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Drag (title bar) and resize (the three edge handles) each track one
  // pointer from down to up, mutating the node's inline style live and
  // reporting the final rect once the pointer lifts.
  React.useEffect(() => {
    const node = nodeRef.current;
    const titleBar = titleBarRef.current;
    const east = eastRef.current;
    const south = southRef.current;
    const corner = cornerRef.current;
    if (!node || !titleBar || !east || !south || !corner || !open) return;
    // Captured by the closures below as `const`s; none of them get reassigned,
    // so the null check above holds for the effect's whole lifetime.

    function commitRect() {
      const box = node!.getBoundingClientRect();
      onRectChange({ x: box.left, y: box.top, width: box.width, height: box.height });
    }

    function onTitleBarDown(event: PointerEvent) {
      const target = event.target as HTMLElement;
      if (target.closest("button,input,textarea,select,a")) return;
      const start = node!.getBoundingClientRect();
      const originX = event.clientX;
      const originY = event.clientY;

      function onMove(moveEvent: PointerEvent) {
        const x = clamp(start.left + (moveEvent.clientX - originX), -(start.width - 80), window.innerWidth - 80);
        const y = clamp(start.top + (moveEvent.clientY - originY), topInset, window.innerHeight - 40);
        node!.style.left = `${x}px`;
        node!.style.top = `${y}px`;
      }
      function onUp() {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.body.style.userSelect = "";
        commitRect();
      }
      document.body.style.userSelect = "none";
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    }

    function makeResizeHandler(edge: "e" | "s" | "se") {
      return function onResizeDown(event: PointerEvent) {
        event.preventDefault();
        const start = node!.getBoundingClientRect();
        const originX = event.clientX;
        const originY = event.clientY;

        function onMove(moveEvent: PointerEvent) {
          const dx = moveEvent.clientX - originX;
          const dy = moveEvent.clientY - originY;
          if (edge !== "s") {
            node!.style.width = `${clamp(start.width + dx, minWidth, window.innerWidth - start.left)}px`;
          }
          if (edge !== "e") {
            node!.style.height = `${clamp(start.height + dy, minHeight, window.innerHeight - start.top)}px`;
          }
        }
        function onUp() {
          document.removeEventListener("pointermove", onMove);
          document.removeEventListener("pointerup", onUp);
          document.body.style.userSelect = "";
          commitRect();
        }
        document.body.style.userSelect = "none";
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
      };
    }

    const onEastDown = makeResizeHandler("e");
    const onSouthDown = makeResizeHandler("s");
    const onCornerDown = makeResizeHandler("se");

    titleBar.addEventListener("pointerdown", onTitleBarDown);
    east.addEventListener("pointerdown", onEastDown);
    south.addEventListener("pointerdown", onSouthDown);
    corner.addEventListener("pointerdown", onCornerDown);

    return () => {
      titleBar.removeEventListener("pointerdown", onTitleBarDown);
      east.removeEventListener("pointerdown", onEastDown);
      south.removeEventListener("pointerdown", onSouthDown);
      corner.removeEventListener("pointerdown", onCornerDown);
    };
  }, [open, onRectChange, minWidth, minHeight, topInset]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={nodeRef}
          role="dialog"
          aria-label={title}
          className="fixed z-[100] flex flex-col overflow-hidden rounded-[10px]"
          style={{
            transformOrigin: "50% 50%",
            background: "rgba(237,242,250,0.68)",
            backdropFilter: "blur(34px) saturate(160%)",
            WebkitBackdropFilter: "blur(34px) saturate(160%)",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.45), 0 18px 50px rgba(0,10,40,0.6)",
          }}
          initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.97 }}
          transition={{ duration: reduceMotion ? 0.05 : 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Brushed-metal toolbar: gel traffic lights, then either the
              left-aligned title or the content's own controls. */}
          <div
            ref={titleBarRef}
            className="relative z-[3] flex h-10 flex-none items-center gap-2 py-0 pr-2.5 pl-3 select-none"
            style={{
              backgroundImage: "linear-gradient(180deg, #fbfcfe 0%, #eef1f6 50%, #dfe4ea 51%, #eef1f6 100%)",
              boxShadow: "inset 0 1px 0 #fff, 0 1px 0 #bba891",
            }}
          >
            <TrafficLights onClose={onClose} className="mr-1.5" />
            {toolbar ? (
              <div ref={setToolbarSlot} className="flex min-w-0 flex-1 items-center gap-2" />
            ) : (
              <>
                <WindowTitle>{title}</WindowTitle>
                {titleAccessory}
              </>
            )}
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-auto">
            <ToolbarSlotContext.Provider value={toolbarSlot}>{children}</ToolbarSlotContext.Provider>
          </div>
          {/* Inset gloss hairline, as a sibling overlay (z-50) instead of
              a pseudo-element so it still shows over the opaque toolbar. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-50 rounded-[10px]"
            style={{ boxShadow: "inset 0 0.5px 0 rgba(255,255,255,0.7), inset 0 0 0 0.5px rgba(255,255,255,0.18)" }}
          />
          <div ref={eastRef} className="absolute top-0 right-0 h-full w-2 cursor-ew-resize" />
          <div ref={southRef} className="absolute bottom-0 left-0 h-2 w-full cursor-ns-resize" />
          <div ref={cornerRef} className="absolute right-0 bottom-0 size-4 cursor-nwse-resize" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function WindowTitle({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="min-w-0 truncate text-[13.5px] font-bold text-foreground"
      style={{ marginRight: "auto", textShadow: "0 1px 0 rgba(255,255,255,0.8)" }}
    >
      {children}
    </p>
  );
}

// An inset, rounded content pane inside a window (a list, a sidebar's
// neighbour).
function WindowPane({ className, style, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[7px]", className)}
      style={{ background: "#eef2f7", boxShadow: "inset 0 0 0 1px rgba(120,95,70,0.32)", ...style }}
      {...props}
    />
  );
}

// The one line of centered summary text along a window's bottom edge.
function WindowStatusBar({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      aria-live="polite"
      className={cn(
        "-mt-[3px] flex h-[22px] flex-none items-center justify-center truncate px-2.5 pb-[3px] text-[11.5px] text-text-secondary",
        className
      )}
      {...props}
    />
  );
}

export { Window, WindowPane, WindowStatusBar, WindowTitle, WindowToolbar };
