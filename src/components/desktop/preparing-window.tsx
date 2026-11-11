"use client";

import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Window, WindowPane } from "@/components/ui/window";
import { Spinner } from "@/components/ui/spinner";
import { useDesktopStore } from "@/components/desktop/desktop-store";

const PREPARING_WINDOW_ID = "preparing";

// Same footprint as the mockup's 準備中 window
// (docs/desktop-home/mockup/loading.html, scene A).
const PREPARING_WIDTH = 520;
const PREPARING_HEIGHT = 340;

// Centered with plain CSS so the server-rendered HTML is already in place.
export const CENTERED_PREPARING_PLACEMENT: CSSProperties = {
  left: `calc(50vw - ${PREPARING_WIDTH / 2}px)`,
  top: `calc(50vh - ${PREPARING_HEIGHT / 2}px)`,
  width: PREPARING_WIDTH,
  height: PREPARING_HEIGHT,
};

interface PreparingWindowProps {
  // From preparingTitle(pathname); null keeps this window closed.
  title: string | null;
}

// S-準備中: the placeholder for /settings/rules, /bookings/new and
// /bookings/batch/<id> — a window in the same chrome as 預約冊, with a
// spinner and the single word 準備中. It never resolves on its own; the red
// light or Escape (Window already wires both to onClose) is the only way
// out, back to `/`. Its rect lives in the desktop store, same mechanism as
// BookingsWindow, so a drag during this session is remembered instead of
// recentering on every visit.
function PreparingWindow({ title }: PreparingWindowProps) {
  const router = useRouter();
  const windowState = useDesktopStore((state) => state.windows[PREPARING_WINDOW_ID]);
  const setRect = useDesktopStore((state) => state.setRect);

  if (!title) return null;

  return (
    <Window
      title={title}
      open
      rect={windowState?.rect}
      defaultPlacement={CENTERED_PREPARING_PLACEMENT}
      onRectChange={(rect) => setRect(PREPARING_WINDOW_ID, rect)}
      onClose={() => router.push("/")}
    >
      <div className="flex min-h-0 flex-1 p-[7px]">
        <WindowPane className="flex flex-1 items-center justify-center">
          <div role="status" className="flex flex-col items-center gap-3">
            <Spinner />
            <p className="text-[13px] text-text-secondary">準備中</p>
          </div>
        </WindowPane>
      </div>
    </Window>
  );
}

export { PreparingWindow };
