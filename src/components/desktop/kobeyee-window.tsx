"use client";

import { ArrowUpIcon, ClipboardPasteIcon } from "lucide-react";
import { Window } from "@/components/ui/window";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useDesktopStore } from "@/components/desktop/desktop-store";
import { CatImage } from "@/components/desktop/kobeyee-cat";
import {
  CAT_CORNER_WIDTH,
  CAT_CORNER_HEIGHT,
  KOBEYEE_WINDOW_ID,
  KOBEYEE_MIN_WIDTH,
  KOBEYEE_MIN_HEIGHT,
  KOBEYEE_TOP_INSET,
} from "@/components/desktop/kobeyee";

// This is a chat-only shell. 清除 and 送出 are both inert because there is
// no AI wiring yet. The window doesn't open on mount. KobeyeeCat opens it
// on click, same as any other window the Dock or a desktop icon toggles.
function KobeyeeWindow() {
  const windowState = useDesktopStore((state) => state.windows[KOBEYEE_WINDOW_ID]);
  const closeWindow = useDesktopStore((state) => state.closeWindow);
  const setRect = useDesktopStore((state) => state.setRect);

  if (!windowState) return null;

  return (
    <Window
      title="Kobeyee"
      open={windowState.open}
      rect={windowState.rect}
      onRectChange={(rect) => setRect(KOBEYEE_WINDOW_ID, rect)}
      onClose={() => closeWindow(KOBEYEE_WINDOW_ID)}
      minWidth={KOBEYEE_MIN_WIDTH}
      minHeight={KOBEYEE_MIN_HEIGHT}
      topInset={KOBEYEE_TOP_INSET}
      titleAccessory={
        <Button type="button" variant="ghost" size="xs">
          清除
        </Button>
      }
    >
      {/* The shared Window panel is translucent by design (ui/window.tsx),
          which reads fine floating over the wallpaper. Kobeyee usually
          floats over another window instead (the 預約冊 list), so without
          an opaque fill that window's content shows through the blur as
          ghost text. This gives the body a solid surface instead,
          matching the mockup's conversation panel. 預約冊 keeps the
          shared translucent look untouched. */}
      <div className="flex min-h-full flex-col bg-surface-solid">
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
          <CatImage width={CAT_CORNER_WIDTH} height={CAT_CORNER_HEIGHT} />
          <p>貼上 LINE 訊息</p>
        </div>
        <div className="flex-none p-3">
          <div className="flex flex-col rounded-2xl bg-white/80 shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.1)] focus-within:shadow-[0_0_0_0.5px_rgba(10,100,214,0.5),0_0_0_3px_rgba(10,100,214,0.12)]">
            <Textarea
              placeholder="貼上 LINE 訊息"
              aria-label="訊息"
              className="h-16 resize-none border-0 bg-transparent shadow-none focus-visible:border-transparent focus-visible:ring-0"
            />
            <div className="flex items-center justify-between px-2.5 pb-2.5">
              <Button type="button" variant="ghost" size="sm">
                <ClipboardPasteIcon /> 貼上
              </Button>
              <Button type="button" size="icon" aria-label="送出">
                <ArrowUpIcon />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Window>
  );
}

export { KobeyeeWindow };
