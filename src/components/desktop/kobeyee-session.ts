// The Kobeyee conversation as one pure state machine, plus the geometry
// that derives the window rect from the chat column's rect. No React here:
// the store wraps reduceKobeyee, timers live in kobeyee-window.tsx.
import type { WindowRect } from "@/components/ui/window";
import type { BookingDraft, SlotDraft } from "@/server/logic/booking";
import { shortDateParts } from "@/server/logic/date";
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
  | { kind: "failed" }
  // Staff pressed 確認登記 and the booking was written; the form stays,
  // read-only, next to the reply staff can copy to the renter.
  | { kind: "registered"; review: KobeyeeReview; count: number; reply: string };

// Staff's answer to one 待確認重疊 question, keyed by SlotReview index.
type OverlapAnswer = "include" | "skip";

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
  overlapAnswers: Record<number, OverlapAnswer>;
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
  | { type: "answerOverlap"; slotIndex: number; answer: OverlapAnswer }
  | { type: "registered"; reply: string }
  | { type: "moveWindow"; windowRect: WindowRect; viewport: Viewport };

/** Reader seam: the AI action, or the fixture under e2e. */
export type KobeyeeReader = (text: string) => Promise<KobeyeeResult>;

type KobeyeeSubmitOutcome =
  | { status: "registered" }
  // Someone else's held booking overlaps; staff may resend with these ids.
  | { status: "conflicts"; conflictIds: string[] }
  | { status: "error"; message: string };

/** Writes the draft staff confirmed; the AI never calls this. */
export type KobeyeeSubmitter = (draft: BookingDraft, acknowledgedIds: string[]) => Promise<KobeyeeSubmitOutcome>;

export const INITIAL_KOBEYEE_SESSION: KobeyeeSession = {
  open: false,
  layout: "chat",
  chatRect: null,
  phase: { kind: "empty" },
  draft: null,
  message: null,
  requestSeq: 0,
  overlapAnswers: {},
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
        overlapAnswers: {},
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
      return { ...s, layout: "chat", phase: { kind: "empty" }, draft: null, message: null, overlapAnswers: {} };
    case "answerOverlap": {
      if (s.phase.kind !== "filling" && s.phase.kind !== "filled") return s;
      if (s.overlapAnswers[e.slotIndex] || !s.draft) return s;
      const slot = s.phase.review.slots[e.slotIndex];
      if (slot?.state !== "overlap") return s;
      const draft = e.answer === "include" ? { ...s.draft, slots: [...s.draft.slots, slot.slot] } : s.draft;
      return { ...s, draft, overlapAnswers: { ...s.overlapAnswers, [e.slotIndex]: e.answer } };
    }
    case "registered": {
      if (s.phase.kind !== "filled" || !s.draft) return s;
      return { ...s, phase: { kind: "registered", review: s.phase.review, count: s.draft.slots.length, reply: e.reply } };
    }
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

/** Kobeyee's line for a read that produced no review, or null. */
export function kobeyeeLine(phase: KobeyeePhase): string | null {
  if (phase.kind === "unreadable") return "看不懂這則訊息";
  if (phase.kind === "failed") return "讀取失敗";
  return null;
}

/** 11/14（六）16:00–17:30 */
function slotLabel(slot: SlotDraft): string {
  const { monthDay, weekday } = shortDateParts(slot.date);
  return `${monthDay}${weekday}${slot.start}–${slot.end}`;
}

/** The lead line: bookable count, then blocked count when any. */
export function kobeyeeLead(review: KobeyeeReview): string {
  // "overlap" gets its own question below the lead and "incomplete" has
  // no slot yet, so neither counts toward 可以 or 不行.
  const legal = review.slots.filter((slot) => slot.state === "legal").length;
  const blocked = review.slots.filter((slot) => slot.state === "blocked").length;
  return blocked > 0 ? `${legal} 段可以，${blocked} 段不行` : `${legal} 段可以`;
}

export function blockedSlots(review: KobeyeeReview): Array<{ label: string; reason: string }> {
  return review.slots.flatMap((slot) => (slot.state === "blocked" ? [{ label: slotLabel(slot.slot), reason: slot.reason }] : []));
}

export function overlapQuestions(review: KobeyeeReview): Array<{ slotIndex: number; text: string }> {
  return review.slots.flatMap((slot, slotIndex) => {
    if (slot.state !== "overlap") return [];
    const rivals = slot.conflicts.map((c) => `${c.renterName} ${c.start}–${c.end}`).join("、");
    return [{ slotIndex, text: `${slotLabel(slot.slot)} 跟 ${rivals} 待確認重疊` }];
  });
}

/** Rival hold ids staff chose to book past (一起建立), for submitBooking. */
export function acknowledgedConflictIds(session: KobeyeeSession): string[] {
  if (session.phase.kind !== "filled") return [];
  const { review } = session.phase;
  return Object.entries(session.overlapAnswers).flatMap(([index, answer]) => {
    const slot = review.slots[Number(index)];
    return answer === "include" && slot?.state === "overlap" ? slot.conflicts.map((c) => c.id) : [];
  });
}

/** 確認登記 appears once nothing is left for staff to answer. */
export function readyToRegister(session: KobeyeeSession): boolean {
  const { phase, draft } = session;
  if (phase.kind !== "filled" || !draft) return false;
  const unanswered = overlapQuestions(phase.review).some(({ slotIndex }) => !session.overlapAnswers[slotIndex]);
  return draft.renter !== null && draft.purpose !== null && draft.slots.length > 0 && !unanswered;
}

const ROOM_LABEL = { A: "大教室", B: "小教室" } as const;

/** The reply staff copy to the renter after 確認登記; never sent by Kobeyee. */
export function renterReply(session: KobeyeeSession, total: number | null): string {
  const { phase, draft } = session;
  if (phase.kind !== "filled" || !draft) return "";
  const lines = [`你好～幫你登記好${ROOM_LABEL[draft.room]}了：`, ...draft.slots.map((slot) => `・${slotLabel(slot)}`)];
  if (total !== null && total > 0) lines.push(`共 ${total.toLocaleString("en-US")} 元`);
  const refused = [
    ...blockedSlots(phase.review).map(({ label, reason }) => `・${label} ${reason}`),
    ...phase.review.slots.flatMap((slot, index) =>
      slot.state === "overlap" && session.overlapAnswers[index] === "skip" ? [`・${slotLabel(slot.slot)} 已有人預約`] : [],
    ),
  ];
  if (refused.length > 0) lines.push("", "以下時段不行：", ...refused);
  if (draft.payment === "on_site") lines.push("", "費用當天到櫃檯繳交即可");
  return lines.join("\n");
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
