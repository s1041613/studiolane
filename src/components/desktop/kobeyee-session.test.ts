import { describe, expect, it } from "vitest";
import {
  FORM_WIDTH,
  INITIAL_KOBEYEE_SESSION,
  kobeyeeWindowRect,
  reduceKobeyee,
  type KobeyeeEvent,
  type KobeyeeSession,
} from "@/components/desktop/kobeyee-session";
import { DRAFT_FIELDS, type KobeyeeResult, type KobeyeeReview } from "@/server/logic/kobeyee";

const CHAT = { x: 1000, y: 120, width: 440, height: 560 };
const VIEWPORT = { width: 1480 };

const REVIEW: KobeyeeReview = {
  intent: "new_rental",
  slots: [],
  draft: { room: "B", renter: null, slots: [], purpose: "dance", payment: "transfer" },
  oldBookings: [],
  questions: [],
};
const OK: KobeyeeResult = { status: "ok", reviews: [REVIEW] };

function run(events: KobeyeeEvent[], from: KobeyeeSession = INITIAL_KOBEYEE_SESSION): KobeyeeSession {
  return events.reduce(reduceKobeyee, from);
}

const opened = run([{ type: "open", layout: "chat", defaultChatRect: CHAT }]);
const sent = run([{ type: "send", text: "hi" }], opened);
const filling = run([{ type: "resolved", requestId: sent.requestSeq, result: OK }], sent);

describe("reduceKobeyee", () => {
  it("send moves to reading and expands; the review then fills row by row to filled", () => {
    expect(sent.phase).toEqual({ kind: "reading", requestId: 1 });
    expect(sent.layout).toBe("booking");
    expect(filling.phase).toEqual({ kind: "filling", review: REVIEW, revealed: 0 });
    expect(filling.draft).toEqual(REVIEW.draft);

    const ticks = DRAFT_FIELDS.map(() => ({ type: "revealTick" }) as const);
    expect(run(ticks.slice(1), filling).phase.kind).toBe("filling");
    expect(run(ticks, filling).phase).toEqual({ kind: "filled", review: REVIEW });
  });

  it("staff input during filling finishes the fill", () => {
    const draft = { ...REVIEW.draft, note: "x" };
    const edited = run([{ type: "editDraft", draft }], filling);
    expect(edited.phase.kind).toBe("filled");
    expect(edited.draft).toEqual(draft);
    expect(run([{ type: "revealFinish" }], filling).phase.kind).toBe("filled");
  });

  it("ignores a stale resolve", () => {
    const resent = run([{ type: "send", text: "again" }], sent);
    expect(run([{ type: "resolved", requestId: sent.requestSeq, result: OK }], resent)).toBe(resent);
  });

  it("an unreadable result stays chat-only", () => {
    const s = run([{ type: "resolved", requestId: sent.requestSeq, result: { status: "unreadable" } }], sent);
    expect(s.layout).toBe("chat");
    expect(s.phase.kind).toBe("unreadable");
  });

  it.each([
    ["empty", opened],
    ["reading", sent],
    ["filling", filling],
  ])("清除 from %s returns to an empty chat-only session", (_, from) => {
    const cleared = run([{ type: "clear" }], from);
    expect(cleared).toMatchObject({ layout: "chat", phase: { kind: "empty" }, draft: null, message: null });
    expect(run([{ type: "clear" }], cleared)).toEqual(cleared);
  });

  it("the Dock opens the expanded form with an empty draft and no skeleton", () => {
    const s = run([{ type: "open", layout: "booking", defaultChatRect: CHAT }]);
    expect(s).toMatchObject({ open: true, layout: "booking", phase: { kind: "manual" } });
    expect(s.draft).toMatchObject({ renter: null, slots: [] });
  });
});

describe("kobeyeeWindowRect", () => {
  it("grows leftward only, keeping the right edge, top and height", () => {
    const rect = kobeyeeWindowRect("booking", CHAT, VIEWPORT);
    expect(rect.x + rect.width).toBe(CHAT.x + CHAT.width);
    expect(rect).toMatchObject({ x: CHAT.x - FORM_WIDTH, y: CHAT.y, height: CHAT.height });
    expect(kobeyeeWindowRect("chat", CHAT, VIEWPORT)).toEqual(CHAT);
  });

  it("stays inside the viewport near the left edge", () => {
    const rect = kobeyeeWindowRect("booking", { ...CHAT, x: 200 }, VIEWPORT);
    expect(rect.x).toBeGreaterThanOrEqual(0);
  });

  it("moving the expanded window moves the chat column with it", () => {
    const s = run([{ type: "open", layout: "booking", defaultChatRect: CHAT }]);
    const windowRect = kobeyeeWindowRect(s.layout, s.chatRect!, VIEWPORT);
    const moved = run([{ type: "moveWindow", windowRect: { ...windowRect, x: windowRect.x - 50 }, viewport: VIEWPORT }], s);
    expect(moved.chatRect).toEqual({ ...CHAT, x: CHAT.x - 50 });
  });
});
