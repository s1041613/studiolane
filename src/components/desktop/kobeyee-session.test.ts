import { describe, expect, it } from "vitest";
import {
  FORM_WIDTH,
  INITIAL_KOBEYEE_SESSION,
  kobeyeeLine,
  kobeyeeWindowRect,
  acknowledgedConflictIds,
  blockedSlots,
  kobeyeeLead,
  overlapQuestions,
  readyToCreate,
  renterReply,
  reduceKobeyee,
  type KobeyeeEvent,
  type KobeyeeSession,
} from "@/components/desktop/kobeyee-session";
import type { SlotDraft } from "@/server/logic/booking";
import { RentalStatus } from "@/server/types/home";
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
const SLOT: SlotDraft = { date: "2026-01-01", start: "10:00", end: "11:00", isCrossMidnight: false };

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

  it("a failed read returns to chat and keeps the message for retry", () => {
    const s = run([{ type: "resolved", requestId: sent.requestSeq, result: { status: "failed" } }], sent);
    expect(s.layout).toBe("chat");
    expect(s.phase).toEqual({ kind: "failed" });
    expect(s.message).toBe("hi");
  });

  it("retry resends the kept message as a fresh request", () => {
    const failed = run([{ type: "resolved", requestId: sent.requestSeq, result: { status: "failed" } }], sent);
    const retried = run([{ type: "retry" }], failed);
    expect(retried.phase).toEqual({ kind: "reading", requestId: failed.requestSeq + 1 });
    expect(retried.layout).toBe("booking");
    expect(retried.message).toBe("hi");
  });

  it("retry is a no-op outside the failed phase", () => {
    expect(run([{ type: "retry" }], sent)).toBe(sent);
    expect(run([{ type: "retry" }], opened)).toBe(opened);
  });

  it("clearing while reading discards the in-flight result", () => {
    const cleared = run([{ type: "clear" }], sent);
    expect(run([{ type: "resolved", requestId: sent.requestSeq, result: OK }], cleared)).toBe(cleared);
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

describe("kobeyeeLine", () => {
  it("reads 讀取失敗 for a failed phase", () => {
    expect(kobeyeeLine({ kind: "failed" })).toBe("讀取失敗");
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


const RIVAL = { id: "h1", date: "2026-01-01", start: "09:30", end: "10:30", renterName: "陳大樹", status: RentalStatus.Pending };
const MIXED: KobeyeeReview = {
  ...REVIEW,
  slots: [
    { state: "legal", slot: SLOT, quote: "q", inferred: { year: false } },
    { state: "incomplete", date: "2026-01-01", start: null, end: null, quote: "q", inferred: { year: false } },
    { state: "blocked", slot: { ...SLOT, date: "2026-01-03" }, reason: "場地保養", quote: "q", inferred: { year: false } },
    { state: "overlap", slot: { ...SLOT, date: "2026-01-02" }, conflicts: [RIVAL], quote: "q", inferred: { year: false } },
  ],
  draft: { ...REVIEW.draft, slots: [SLOT] },
};
const RENTER = { type: "roster", id: "p1", name: "林小雨", role: "teacher" } as const;

function filledWith(review: KobeyeeReview): KobeyeeSession {
  const s = run([{ type: "send", text: "hi" }], opened);
  return run([{ type: "resolved", requestId: s.requestSeq, result: { status: "ok", reviews: [review] } }, { type: "revealFinish" }], s);
}

describe("conversation lines", () => {
  it("leads with bookable and blocked counts, leaving overlap and incomplete out", () => {
    expect(kobeyeeLead(MIXED)).toBe("1 段可以，1 段不行");
    expect(blockedSlots(MIXED)).toEqual([{ label: "1/3（六）10:00–11:00", reason: "場地保養" }]);
    expect(overlapQuestions(MIXED)).toEqual([{ slotIndex: 3, text: "1/2（五）10:00–11:00 跟 陳大樹 09:30–10:30 待確認重疊" }]);
  });
});

describe("creating", () => {
  it("waits for the renter and every overlap answer", () => {
    let s = filledWith(MIXED);
    s = run([{ type: "editDraft", draft: { ...s.draft!, renter: RENTER } }], s);
    expect(readyToCreate(s)).toBe(false);
    s = run([{ type: "answerOverlap", slotIndex: 3, answer: "include" }], s);
    expect(readyToCreate(s)).toBe(true);
    expect(s.draft!.slots).toHaveLength(2);
    expect(acknowledgedConflictIds(s)).toEqual(["h1"]);
  });

  it("a skipped overlap stays out of the draft and shows as refused in the reply", () => {
    let s = filledWith(MIXED);
    s = run([{ type: "editDraft", draft: { ...s.draft!, renter: RENTER } }, { type: "answerOverlap", slotIndex: 3, answer: "skip" }], s);
    expect(s.draft!.slots).toHaveLength(1);
    expect(acknowledgedConflictIds(s)).toEqual([]);
    expect(renterReply(s, 300)).toBe(
      ["你好～幫你預約了小教室：", "・1/1（四）10:00–11:00", "共 300 元", "", "以下時段不行：", "・1/3（六）10:00–11:00 場地保養", "・1/2（五）10:00–11:00 已有人預約", "", "範例銀行（000）", "戶名：範例舞蹈教室", "帳號：000-000-000000", "匯款完成請提供末五碼以利對帳"].join("\n"),
    );
  });

  it("keeps the review and slot count once created", () => {
    const s = run([{ type: "created", reply: "r" }], filledWith(MIXED));
    expect(s.phase).toMatchObject({ kind: "created", count: 1, reply: "r" });
    expect(s.layout).toBe("booking");
  });
});
