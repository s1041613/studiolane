// The Kobeyee conversation as one pure state machine, plus the geometry
// that derives the window rect from the chat column's rect. No React here:
// the store wraps reduceKobeyee, timers live in kobeyee-window.tsx.
import type { WindowRect } from "@/components/ui/window";
import type { BookingDraft } from "@/server/logic/booking";
import { DRAFT_FIELDS, type KobeyeeResult, type KobeyeeReview } from "@/server/logic/kobeyee";

export type KobeyeeLayout = "chat" | "booking";

export type KobeyeePhase =
  | { kind: "empty" }
  | { kind: "reading"; requestId: number }
  | { kind: "filling"; review: KobeyeeReview; revealed: number }
  | { kind: "filled"; review: KobeyeeReview }
  // Opened from the Dock: an empty form staff fill in by hand.
  | { kind: "manual" }
  | { kind: "unreadable" }
  // The read itself didn't finish; `message` on the session is kept so
  // `retry` can resend it.
  | { kind: "failed" };

export interface KobeyeeSession {
  open: boolean;
  layout: KobeyeeLayout;
  // The chat column's rect, null until first opened. The window rect is
  // derived from it (kobeyeeWindowRect), never stored.
  chatRect: WindowRect | null;
  phase: KobeyeePhase;
  draft: BookingDraft | null;
  message: string | null;
  requestSeq: number;
}

interface Viewport {
  width: number;
}

export type KobeyeeEvent =
  | { type: "open"; layout: KobeyeeLayout; defaultChatRect: WindowRect }
  | { type: "close" }
  | { type: "send"; text: string }
  // Resends the kept message after a failed read; only valid from "failed".
  | { type: "retry" }
  | { type: "resolved"; requestId: number; result: KobeyeeResult }
  | { type: "revealTick" }
  | { type: "revealFinish" }
  | { type: "editDraft"; draft: BookingDraft }
  | { type: "clear" }
  | { type: "moveWindow"; windowRect: WindowRect; viewport: Viewport };

/** Reader seam: a fixture now, the real route later. */
export type KobeyeeReader = (text: string) => Promise<KobeyeeResult>;

export const INITIAL_KOBEYEE_SESSION: KobeyeeSession = {
  open: false,
  layout: "chat",
  chatRect: null,
  phase: { kind: "empty" },
  draft: null,
  message: null,
  requestSeq: 0,
};

export function blankDraft(): BookingDraft {
  return { room: "B", renter: null, slots: [], purpose: null, payment: "transfer" };
}

// Staff input or the timer's end both finish the fill the same way.
function finishReveal(phase: KobeyeePhase): KobeyeePhase {
  return phase.kind === "filling" ? { kind: "filled", review: phase.review } : phase;
}

export function reduceKobeyee(s: KobeyeeSession, e: KobeyeeEvent): KobeyeeSession {
  switch (e.type) {
    case "open": {
      const opened = { ...s, open: true, chatRect: s.chatRect ?? e.defaultChatRect };
      if (e.layout === "chat") return opened;
      return opened.draft
        ? { ...opened, layout: "booking" }
        : { ...opened, layout: "booking", phase: { kind: "manual" }, draft: blankDraft() };
    }
    case "close":
      return { ...s, open: false };
    case "send": {
      const requestId = s.requestSeq + 1;
      return {
        ...s,
        layout: "booking",
        phase: { kind: "reading", requestId },
        draft: null,
        message: e.text,
        requestSeq: requestId,
      };
    }
    case "resolved": {
      if (s.phase.kind !== "reading" || s.phase.requestId !== e.requestId) return s;
      if (e.result.status === "failed") return { ...s, layout: "chat", phase: { kind: "failed" } };
      const review = e.result.status === "ok" ? e.result.reviews[0] : undefined;
      if (!review) return { ...s, layout: "chat", phase: { kind: "unreadable" } };
      return { ...s, phase: { kind: "filling", review, revealed: 0 }, draft: review.draft };
    }
    case "retry":
      return s.phase.kind === "failed" && s.message !== null ? reduceKobeyee(s, { type: "send", text: s.message }) : s;
    case "revealTick": {
      if (s.phase.kind !== "filling") return s;
      const revealed = s.phase.revealed + 1;
      return {
        ...s,
        phase: revealed >= DRAFT_FIELDS.length ? finishReveal(s.phase) : { ...s.phase, revealed },
      };
    }
    case "revealFinish":
      return s.phase.kind === "filling" ? { ...s, phase: finishReveal(s.phase) } : s;
    case "editDraft":
      return { ...s, draft: e.draft, phase: finishReveal(s.phase) };
    case "clear":
      return { ...s, layout: "chat", phase: { kind: "empty" }, draft: null, message: null };
    case "moveWindow":
      if (!s.chatRect) return s;
      return { ...s, chatRect: chatRectFrom(e.windowRect, s.layout, s.chatRect, e.viewport) };
  }
}

/** How many form rows show their value; the rest are skeletons. */
export function revealedCount(phase: KobeyeePhase): number {
  if (phase.kind === "reading") return 0;
  if (phase.kind === "filling") return phase.revealed;
  return DRAFT_FIELDS.length;
}

/** Kobeyee's one line in the chat, or null while it has nothing to say. */
export function kobeyeeLine(phase: KobeyeePhase): string | null {
  if (phase.kind === "unreadable") return "看不懂這則訊息";
  if (phase.kind === "failed") return "讀取失敗";
  if (phase.kind !== "filling" && phase.kind !== "filled") return null;
  const legal = phase.review.slots.filter((slot) => slot.state === "legal").length;
  // "incomplete" has no SlotDraft yet (needs a `time` question): it's
  // neither legal nor rejected, so it's left out of both counts rather
  // than counted as "不行".
  const rejected = phase.review.slots.filter((slot) => slot.state === "blocked" || slot.state === "overlap").length;
  return rejected > 0 ? `${legal} 段可以，${rejected} 段不行` : `${legal} 段可以`;
}

/** One line per slot that can't be booked, so staff see which ones and why. */
export function rejectedSlotLines(phase: KobeyeePhase): string[] {
  if (phase.kind !== "filling" && phase.kind !== "filled") return [];
  return phase.review.slots.flatMap((slot) => {
    if (slot.state !== "blocked" && slot.state !== "overlap") return [];
    const { date, start, end } = slot.slot;
    const reason = slot.state === "blocked" ? slot.reason : "時間重疊";
    return [`${Number(date.slice(5, 7))}/${Number(date.slice(8))} ${start}-${end} ${reason}`];
  });
}

export const FORM_WIDTH = 600;
export const FORM_MIN_WIDTH = 420;
const DESKTOP_MARGIN = 16;

function formWidthFor(chat: WindowRect, viewport: Viewport): number {
  return Math.max(FORM_MIN_WIDTH, Math.min(FORM_WIDTH, viewport.width - 2 * DESKTOP_MARGIN - chat.width));
}

/** The window grows leftward from the chat column, so the right edge (and the perched cat) stay put unless the left screen edge stops it. */
export function kobeyeeWindowRect(layout: KobeyeeLayout, chat: WindowRect, viewport: Viewport): WindowRect {
  if (layout === "chat") return chat;
  const form = formWidthFor(chat, viewport);
  return { x: Math.max(DESKTOP_MARGIN, chat.x - form), y: chat.y, width: form + chat.width, height: chat.height };
}

/** Inverse of kobeyeeWindowRect after a drag or resize: the form keeps its width and the chat column takes the rest. */
function chatRectFrom(windowRect: WindowRect, layout: KobeyeeLayout, chat: WindowRect, viewport: Viewport): WindowRect {
  if (layout === "chat") return windowRect;
  const form = formWidthFor(chat, viewport);
  return { ...windowRect, x: windowRect.x + form, width: windowRect.width - form };
}
