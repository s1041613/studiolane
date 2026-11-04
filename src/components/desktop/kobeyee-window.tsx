"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import { ArrowUpIcon, ClipboardPasteIcon } from "lucide-react";
import { Window } from "@/components/ui/window";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useDesktopStore } from "@/components/desktop/desktop-store";
import { CatImage } from "@/components/desktop/kobeyee-cat";
import {
  CAT_CORNER_WIDTH,
  CAT_CORNER_HEIGHT,
  KOBEYEE_MIN_WIDTH,
  KOBEYEE_MIN_HEIGHT,
  KOBEYEE_TOP_INSET,
} from "@/components/desktop/kobeyee";
import {
  FORM_MIN_WIDTH,
  blankDraft,
  kobeyeeLine,
  kobeyeeWindowRect,
  revealedCount,
  type KobeyeeReader,
} from "@/components/desktop/kobeyee-session";
import type { BookingDraft } from "@/server/logic/booking";
import { DRAFT_FIELDS } from "@/server/logic/kobeyee";

interface BookingFormSlotProps {
  draft: BookingDraft;
  // Rows at or past this index in DRAFT_FIELDS render as skeletons.
  revealed: number;
  onDraftChange: (draft: BookingDraft) => void;
}

export interface KobeyeeWindowProps {
  reader: KobeyeeReader;
  renderBookingForm: (props: BookingFormSlotProps) => ReactNode;
}

const REVEAL_MS = 1500;

function KobeyeeWindow({ reader, renderBookingForm }: KobeyeeWindowProps) {
  const session = useDesktopStore((state) => state.kobeyee);
  const dispatch = useDesktopStore((state) => state.dispatchKobeyee);
  const send = useDesktopStore((state) => state.sendToKobeyee);
  const reduceMotion = useReducedMotion();
  const [text, setText] = useState("");

  const filling = session.phase.kind === "filling";
  useEffect(() => {
    if (!filling) return;
    if (reduceMotion) {
      dispatch({ type: "revealFinish" });
      return;
    }
    const timer = setInterval(() => dispatch({ type: "revealTick" }), REVEAL_MS / DRAFT_FIELDS.length);
    return () => clearInterval(timer);
  }, [filling, reduceMotion, dispatch]);

  if (!session.chatRect) return null;
  const { chatRect, layout, phase, message } = session;
  const viewport = { width: window.innerWidth };
  const booking = layout === "booking";
  const line = kobeyeeLine(phase);

  function submit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setText("");
    void send(trimmed, reader);
  }

  return (
    <Window
      title={booking ? "預約教室" : "Kobeyee"}
      open={session.open}
      rect={kobeyeeWindowRect(layout, chatRect, viewport)}
      animateRect
      onRectChange={(windowRect) => dispatch({ type: "moveWindow", windowRect, viewport })}
      onClose={() => dispatch({ type: "close" })}
      minWidth={booking ? FORM_MIN_WIDTH + KOBEYEE_MIN_WIDTH : KOBEYEE_MIN_WIDTH}
      minHeight={KOBEYEE_MIN_HEIGHT}
      topInset={KOBEYEE_TOP_INSET}
      titleAccessory={
        <Button type="button" variant="ghost" size="xs" onClick={() => dispatch({ type: "clear" })}>
          清除
        </Button>
      }
    >
      {/* Opaque body: Kobeyee usually floats over the 預約冊 window, whose
          text would otherwise ghost through the translucent Window panel. */}
      <div className="flex h-full justify-end bg-surface-solid">
        {booking && (
          // Any click or key in the form finishes the skeleton fill.
          <section
            aria-label="預約表單"
            className="min-w-0 flex-1 overflow-auto border-r border-divider"
            onPointerDownCapture={() => dispatch({ type: "revealFinish" })}
            onKeyDownCapture={() => dispatch({ type: "revealFinish" })}
          >
            {renderBookingForm({
              draft: session.draft ?? blankDraft(),
              revealed: revealedCount(phase),
              onDraftChange: (draft) => dispatch({ type: "editDraft", draft }),
            })}
          </section>
        )}
        <div className="flex h-full flex-none flex-col" style={{ width: chatRect.width }}>
          {message === null ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
              <CatImage width={CAT_CORNER_WIDTH} height={CAT_CORNER_HEIGHT} />
              <p>貼上 LINE 訊息</p>
            </div>
          ) : (
            <div className="flex flex-1 flex-col gap-4 overflow-auto p-4 text-sm">
              <p className="ml-8 self-end rounded-2xl bg-selected px-3.5 py-2.5 whitespace-pre-wrap">{message}</p>
              {line && <p className="font-semibold">{line}</p>}
            </div>
          )}
          <div className="flex-none p-3">
            <div className="flex flex-col rounded-2xl bg-white/80 shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.1)] focus-within:shadow-[0_0_0_0.5px_rgba(10,100,214,0.5),0_0_0_3px_rgba(10,100,214,0.12)]">
              <Textarea
                placeholder="貼上 LINE 訊息"
                aria-label="訊息"
                value={text}
                onChange={(event) => setText(event.target.value)}
                className="h-16 resize-none border-0 bg-transparent shadow-none focus-visible:border-transparent focus-visible:ring-0"
              />
              <div className="flex items-center justify-between px-2.5 pb-2.5">
                <Button type="button" variant="ghost" size="sm">
                  <ClipboardPasteIcon /> 貼上
                </Button>
                <Button type="button" size="icon" aria-label="送出" onClick={submit}>
                  <ArrowUpIcon />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Window>
  );
}

export { KobeyeeWindow };
