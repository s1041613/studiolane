"use client";

import type { CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { useDesktopStore } from "@/components/desktop/desktop-store";
import {
  CAT_IMAGE_SRC,
  CAT_CORNER_WIDTH,
  CAT_CORNER_HEIGHT,
  CORNER_RIGHT,
  CORNER_BOTTOM,
  KOBEYEE_WINDOW_ID,
  defaultKobeyeeRect,
  perchPosition,
} from "@/components/desktop/kobeyee";

interface CatImageProps {
  width: number;
  height: number;
  className?: string;
  style?: CSSProperties;
}

// Shared by the corner button below and the window's empty conversation
// state (kobeyee-window.tsx).
function CatImage({ width, height, className, style }: CatImageProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- pixel art: next/image's resampling would blur cat.png, a plain img keeps it crisp at image-rendering: pixelated.
    <img
      src={CAT_IMAGE_SRC}
      alt=""
      width={width}
      height={height}
      className={className}
      style={{ imageRendering: "pixelated", ...style }}
    />
  );
}

// The cat: a corner button that opens Kobeyee, or (while the window is
// open) a non-interactive sprite perched on the window's top edge, moving
// with it since its position is derived from the window's rect.
function KobeyeeCat() {
  const windowState = useDesktopStore((state) => state.windows[KOBEYEE_WINDOW_ID]);
  const openWindow = useDesktopStore((state) => state.openWindow);
  const open = windowState?.open ?? false;

  if (open && windowState) {
    const box = perchPosition(windowState.rect);
    return (
      <CatImage
        width={box.width}
        height={box.height}
        className="fixed z-[110] drop-shadow-[0_6px_6px_rgba(0,25,80,0.35)]"
        style={{ left: box.left, top: box.top }}
      />
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      aria-label="Kobeyee"
      onClick={() => openWindow(KOBEYEE_WINDOW_ID, defaultKobeyeeRect())}
      // Below an open window (z-[100], e.g. the bookings ledger) so an open
      // window's content isn't covered by the cat. Each window's default
      // rect keeps clear of this corner (see CORNER_RESERVE_* in
      // kobeyee.ts) so the corner spot stays reachable without relying on
      // stacking above windows, same as while perched (z-[110] below).
      className="fixed z-[90] h-auto w-auto flex-col items-center gap-1 rounded-2xl border-0 bg-transparent p-1 hover:bg-black/10 focus-visible:ring-white"
      style={{ right: CORNER_RIGHT, bottom: CORNER_BOTTOM }}
    >
      <CatImage width={CAT_CORNER_WIDTH} height={CAT_CORNER_HEIGHT} />
      <span className="rounded-md bg-black/30 px-2 py-px text-xs font-semibold text-white">Kobeyee</span>
    </Button>
  );
}

export { KobeyeeCat, CatImage };
