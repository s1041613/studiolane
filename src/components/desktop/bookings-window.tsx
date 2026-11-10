"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { Window, type WindowRect } from "@/components/ui/window";
import { useDesktopStore } from "@/components/desktop/desktop-store";
import { MENU_BAR_HEIGHT } from "@/components/desktop/menu-bar";
import { CORNER_RIGHT, CORNER_RESERVE_WIDTH } from "@/components/desktop/kobeyee";

export const BOOKINGS_WINDOW_ID = "bookings";

const TOP_GAP = 14;
// Dock height plus its own bottom offset and a little breathing room.
const DOCK_CLEARANCE = 100;
// Each side keeps 6% of the viewport free.
const SIDE_RATIO = 0.06;

// Sized against the current viewport; only meaningful once
// mounted in a browser, so callers only reach for this on the client.
export function defaultBookingsRect(): WindowRect {
  const x = Math.round(window.innerWidth * SIDE_RATIO);
  // Stop short of the idle Kobeyee cat's corner spot (bottom-right): the cat
  // renders below windows in z-order, so an overlap here would cover it.
  const cornerLeft = window.innerWidth - CORNER_RIGHT - CORNER_RESERVE_WIDTH;
  const width = Math.max(640, Math.min(window.innerWidth - x * 2, cornerLeft - x));
  const height = Math.max(360, window.innerHeight - MENU_BAR_HEIGHT - TOP_GAP - DOCK_CLEARANCE);
  return {
    x,
    y: MENU_BAR_HEIGHT + TOP_GAP,
    width,
    height,
  };
}

interface BookingsWindowProps {
  // null on every route but /bookings (the home page has no window content),
  // so its presence is what decides whether the window opens.
  children: ReactNode;
}

// The one v1 window: file-browser-style chrome around the existing
// BookingsView, unchanged. Opens by default whenever its content is
// present, so /bookings reads the same as before the desktop shell existed
// while the home page starts with it closed. Navigating away doesn't close
// it again yet — that two-way URL<->window sync is a later step.
function BookingsWindow({ children }: BookingsWindowProps) {
  const hasContent = children != null;
  const windowState = useDesktopStore((state) => state.windows[BOOKINGS_WINDOW_ID]);
  const openWindow = useDesktopStore((state) => state.openWindow);
  const closeWindow = useDesktopStore((state) => state.closeWindow);
  const setRect = useDesktopStore((state) => state.setRect);

  useEffect(() => {
    if (!hasContent) return;
    openWindow(BOOKINGS_WINDOW_ID, defaultBookingsRect());
    // openWindow is a no-op once the window already exists, so this running
    // again on a future render (it won't, deps are stable) would be safe too.
  }, [hasContent, openWindow]);

  if (!hasContent || !windowState) return null;

  return (
    <Window
      title="預約冊"
      open={windowState.open}
      rect={windowState.rect}
      onRectChange={(rect) => setRect(BOOKINGS_WINDOW_ID, rect)}
      onClose={() => closeWindow(BOOKINGS_WINDOW_ID)}
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
