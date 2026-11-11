"use client";

import type { CSSProperties, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Window } from "@/components/ui/window";
import { useDesktopStore } from "@/components/desktop/desktop-store";
import { MENU_BAR_HEIGHT } from "@/components/desktop/menu-bar";
import { CORNER_RIGHT, CORNER_RESERVE_WIDTH } from "@/components/desktop/kobeyee";

const BOOKINGS_WINDOW_ID = "bookings";

const TOP_GAP = 14;
// Dock height plus its own bottom offset and a little breathing room.
const DOCK_CLEARANCE = 100;
// Each side keeps 6% of the viewport free.
const SIDE_RATIO = 0.06;

// Plain CSS against the viewport so the server-rendered HTML lands in the
// same place the client would: 6% side margins, stopping short of the idle
// Kobeyee cat's corner spot (bottom-right) — the cat renders below windows
// in z-order, so an overlap there would cover it.
export const DEFAULT_BOOKINGS_PLACEMENT: CSSProperties = {
  left: `${SIDE_RATIO * 100}vw`,
  top: MENU_BAR_HEIGHT + TOP_GAP,
  width: `max(640px, min(${100 - SIDE_RATIO * 200}vw, ${100 - SIDE_RATIO * 100}vw - ${CORNER_RIGHT + CORNER_RESERVE_WIDTH}px))`,
  height: `max(360px, 100vh - ${MENU_BAR_HEIGHT + TOP_GAP + DOCK_CLEARANCE}px)`,
};

interface BookingsWindowProps {
  // True on /bookings: the URL is the single source of truth.
  open: boolean;
  children: ReactNode;
}

// The one v1 window: file-browser-style chrome around the existing
// BookingsView, unchanged. `open` follows the URL two-way: it's open
// whenever the route is /bookings, and closing (red light or Escape, which
// Window already wires to onClose) navigates back to / instead of just
// flipping a store flag.
function BookingsWindow({ open, children }: BookingsWindowProps) {
  const router = useRouter();
  const windowState = useDesktopStore((state) => state.windows[BOOKINGS_WINDOW_ID]);
  const setRect = useDesktopStore((state) => state.setRect);

  return (
    <Window
      title="預約冊"
      open={open}
      rect={windowState?.rect}
      defaultPlacement={DEFAULT_BOOKINGS_PLACEMENT}
      onRectChange={(rect) => setRect(BOOKINGS_WINDOW_ID, rect)}
      onClose={() => router.push("/")}
      topInset={MENU_BAR_HEIGHT}
      toolbar
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {/* The window's title bar already shows 預約冊 (minimal copy: no
            second visible heading). This h1 stays for the accessibility
            tree and for the bookings-list e2e spec's heading assertion. */}
        <h1 className="sr-only">預約列表</h1>
        {children}
      </div>
    </Window>
  );
}

export { BookingsWindow };
