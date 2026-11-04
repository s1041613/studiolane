"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { Window, type WindowRect } from "@/components/ui/window";
import { useDesktopStore } from "@/components/desktop/desktop-store";
import { MENU_BAR_HEIGHT } from "@/components/desktop/menu-bar";

export const BOOKINGS_WINDOW_ID = "bookings";

const WINDOW_MARGIN = 16;
// Dock height (70px) plus its own bottom offset and a little breathing room.
const DOCK_CLEARANCE = 96;

// Sized and centered against the current viewport; only meaningful once
// mounted in a browser, so callers only reach for this on the client.
export function defaultBookingsRect(): WindowRect {
  const width = Math.min(1120, Math.max(640, window.innerWidth - WINDOW_MARGIN * 2));
  const height = Math.max(360, window.innerHeight - MENU_BAR_HEIGHT - DOCK_CLEARANCE - WINDOW_MARGIN);
  return {
    x: Math.round((window.innerWidth - width) / 2),
    y: MENU_BAR_HEIGHT + WINDOW_MARGIN,
    width,
    height,
  };
}

interface BookingsWindowProps {
  children: ReactNode;
}

// The one v1 window: Finder-style chrome around the existing BookingsView,
// unchanged. Opens by default so /bookings reads the same as before the
// desktop shell existed.
function BookingsWindow({ children }: BookingsWindowProps) {
  const windowState = useDesktopStore((state) => state.windows[BOOKINGS_WINDOW_ID]);
  const openWindow = useDesktopStore((state) => state.openWindow);
  const closeWindow = useDesktopStore((state) => state.closeWindow);
  const setRect = useDesktopStore((state) => state.setRect);

  useEffect(() => {
    openWindow(BOOKINGS_WINDOW_ID, defaultBookingsRect());
    // openWindow is a no-op once the window already exists, so this running
    // again on a future render (it won't, deps are stable) would be safe too.
  }, [openWindow]);

  if (!windowState) return null;

  return (
    <Window
      title="預約冊"
      open={windowState.open}
      rect={windowState.rect}
      onRectChange={(rect) => setRect(BOOKINGS_WINDOW_ID, rect)}
      onClose={() => closeWindow(BOOKINGS_WINDOW_ID)}
      topInset={MENU_BAR_HEIGHT}
    >
      <div className="flex min-h-full flex-col gap-6 p-4">
        {/* The Finder titlebar already shows 預約冊 (minimal copy: no second
            visible heading). This h1 stays for the accessibility tree and
            for the bookings-list e2e spec's heading assertion. */}
        <h1 className="sr-only">預約列表</h1>
        {children}
      </div>
    </Window>
  );
}

export { BookingsWindow };
