"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import { ArrowUpIcon, ClipboardPasteIcon } from "lucide-react";
import { Window, WindowPane } from "@/components/ui/window";
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
// The chat pane sits inside the window's 8px side gutters.
const CHAT_PANE_INSET = 16;

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
      chrome="plain"
    >
      {/* Opaque panes: Kobeyee usually floats over the 預約冊 window, whose
          text would otherwise ghost through the translucent Window body. */}
      <div className="flex h-full justify-end gap-[7px] px-2 py-[7px]">
        {booking && (
          // Any click or key in the form finishes the skeleton fill.
          <WindowPane
            tone="pane"
            aria-label="預約表單"
            className="min-w-0 flex-1 overflow-auto"
            onPointerDownCapture={() => dispatch({ type: "revealFinish" })}
            onKeyDownCapture={() => dispatch({ type: "revealFinish" })}
          >
            {renderBookingForm({
              draft: session.draft ?? blankDraft(),
              revealed: revealedCount(phase),
              onDraftChange: (draft) => dispatch({ type: "editDraft", draft }),
            })}
          </WindowPane>
        )}
        <WindowPane
          tone="panel"
          aria-label="Kobeyee 對話"
          className="flex h-full flex-none flex-col bg-surface-solid"
          style={{ width: chatRect.width - CHAT_PANE_INSET }}
        >
          <header className="flex h-11 flex-none items-center gap-2.5 px-4 shadow-[0_1px_0_var(--eb-desk-hair)]">
            <span className="relative size-[30px] flex-none overflow-hidden rounded-[7px] bg-(--eb-desk-field) shadow-[inset_0_0_0_1px_var(--eb-desk-edge)]">
              <CatImage width={75} height={80} className="absolute max-w-none" style={{ left: -17, top: -4 }} />
            </span>
            <b className="text-sm font-semibold">Kobeyee</b>
            <Button type="button" variant="bevel" size="xs" className="ml-auto px-2.5" onClick={() => dispatch({ type: "clear" })}>
              清除
            </Button>
          </header>
          {message === null ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-[13px] text-muted-foreground">
              <CatImage width={CAT_CORNER_WIDTH} height={CAT_CORNER_HEIGHT} />
              <p>貼上 LINE 訊息</p>
            </div>
          ) : (
            <div className="flex flex-1 flex-col gap-4 overflow-auto px-[18px] pt-[22px] pb-4 text-sm leading-relaxed">
              <p className="ml-12 self-end rounded-[10px_10px_3px_10px] bg-(--eb-desk-sel) px-3 py-2 text-[13.5px] whitespace-pre-wrap">
                {message}
              </p>
              {line && (
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Kobeyee 說：</p>
                  <p className="text-[15px] font-semibold">{line}</p>
                </div>
              )}
            </div>
          )}
          <div className="flex-none px-3 pt-2.5 pb-3">
            <div className="flex flex-col rounded-md bg-(--eb-desk-field) shadow-[inset_0_1px_2px_rgb(40_60_90/.28),0_0_0_1px_rgb(60_80_120/.36)] focus-within:shadow-[inset_0_1px_2px_rgb(40_60_90/.28),0_0_0_1px_var(--eb-desk-accent-edge),0_0_0_3px_rgb(31_111_214/.25)]">
              <Textarea
                placeholder="貼上 LINE 訊息"
                aria-label="訊息"
                value={text}
                onChange={(event) => setText(event.target.value)}
                className="h-[58px] min-h-0 resize-none border-0 bg-transparent px-3 pt-2.5 pb-0.5 shadow-none hover:border-0 focus-visible:border-transparent focus-visible:ring-0"
              />
              <div className="flex items-center justify-between px-2.5 pb-2.5">
                <Button type="button" variant="ghost" size="xs" className="font-normal text-text-secondary">
                  <ClipboardPasteIcon /> 貼上
                </Button>
                <Button type="button" variant="gel" size="icon-xs" className="size-7 rounded-full" aria-label="送出" disabled={!text.trim()} onClick={submit}>
                  <ArrowUpIcon />
                </Button>
              </div>
            </div>
          </div>
        </WindowPane>
      </div>
    </Window>
  );
}

export { KobeyeeWindow };
