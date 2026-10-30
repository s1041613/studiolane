import { describe, expect, it } from "vitest";
import { checkBooking, getAvailableWindows } from "@/server/logic/booking-rules";
import type { RentalRule, RuleContext } from "@/server/logic/booking-rules";
import { SAMPLE_RULES } from "@/server/logic/test-fixtures";
import type { Purpose, SlotDraft } from "@/server/logic/booking";
import { RentalStatus, PaymentMethod, PaymentState } from "@/server/types/home";
import type { RentalSummary } from "@/server/types/home";
import { toStartsEndsAt } from "@/server/supabase/codecs";

const RULES: RentalRule[] = SAMPLE_RULES;

function ctx(overrides: Partial<RuleContext> = {}): RuleContext {
  return { rules: RULES, existingRentals: [], ...overrides };
}

function slot(overrides: Partial<SlotDraft> = {}): SlotDraft {
  return { date: "2026-10-05", start: "14:00", end: "16:00", isCrossMidnight: false, ...overrides };
}

function makeRental(
  overrides: Partial<RentalSummary> & {
    date: string;
    start: string;
    end: string;
    isCrossMidnight?: boolean;
  },
): RentalSummary {
  const { date, start, end, isCrossMidnight = false, ...rest } = overrides;
  const { startsAt, endsAt } = toStartsEndsAt(date, start, end, isCrossMidnight);
  return {
    id: "r1",
    batchId: null,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    date,
    weekday: "一",
    start,
    end,
    isCrossMidnight,
    room: "A",
    handler: "",
    person: "測試",
    renterId: null,
    renterType: "customer",
    purpose: "dance",
    purposeLabel: "舞蹈",
    paymentState: PaymentState.Unpaid,
    status: RentalStatus.Registered,
    note: "",
    paymentMethod: PaymentMethod.OnSite,
    paymentMethodLabel: "現場繳費",
    amount: null,
    createdAt: "2026-01-01T00:00:00Z",
    ...rest,
  };
}

// 2026-10-05 is a Monday (weekday=1); dates below are chosen to land on the
// specific weekday each example needs.
describe("checkBooking against the 驗證範例 table", () => {
  it.each<{ label: string; date: string; room: "A" | "B"; start: string; end: string; purpose: Purpose; isCrossMidnight?: boolean; expected: boolean; reason?: string }>([
    { label: "週一 A 14:00–16:00 舞蹈 可以", date: "2026-10-05", room: "A", start: "14:00", end: "16:00", purpose: "dance", expected: true },
    { label: "週一 A 17:00–18:00 舞蹈 不行 R1", date: "2026-10-05", room: "A", start: "17:00", end: "18:00", purpose: "dance", expected: false, reason: "10/5 17:30–22:30：上課時段" },
    { label: "週二 A 15:00–16:00 有氧 可以（用途專屬規則已拿掉）", date: "2026-10-06", room: "A", start: "15:00", end: "16:00", purpose: "aerobics", expected: true },
    { label: "週二 B 15:00–16:00 有氧 可以", date: "2026-10-06", room: "B", start: "15:00", end: "16:00", purpose: "aerobics", expected: true },
    { label: "週六 A 10:00–12:00 展演 可以（週末沒有 13:30 前限制）", date: "2026-10-10", room: "A", start: "10:00", end: "12:00", purpose: "performance", expected: true },
    { label: "週五 A 22:30–00:30 展演 可以（跨到週六 00:00–00:30）", date: "2026-10-09", room: "A", start: "22:30", end: "00:30", purpose: "performance", isCrossMidnight: true, expected: true },
    { label: "週四 A 22:30–00:30 展演 可以（跨到週五 00:00–00:30，R3 從 06:00 才開始）", date: "2026-10-08", room: "A", start: "22:30", end: "00:30", purpose: "performance", isCrossMidnight: true, expected: true },
    { label: "週三 A 05:00–07:00 舞蹈 不行 R3", date: "2026-10-07", room: "A", start: "05:00", end: "07:00", purpose: "dance", expected: false, reason: "10/7 06:00–13:30：平日白天 13:30 前不開放" },
    { label: "每天 B 13:00–14:00 不行 R5", date: "2026-10-05", room: "B", start: "13:00", end: "14:00", purpose: "dance", expected: false, reason: "10/5 13:30–14:00：準備時間" },
  ])("$label", ({ date, room, start, end, isCrossMidnight, expected, reason }) => {
    const result = checkBooking(slot({ date, start, end, isCrossMidnight: isCrossMidnight ?? false }), room, ctx());
    expect(result.ok).toBe(expected);
    if (!expected && reason) {
      expect(result.ok === false && result.reason).toBe(reason);
    }
  });
});

describe("checkBooking isCrossMidnight consistency guard", () => {
  it("rejects a same-day input error (end earlier than start) even though it looks like end < start", () => {
    const result = checkBooking(
      slot({ date: "2026-10-05", start: "14:00", end: "13:00", isCrossMidnight: false }),
      "A",
      ctx(),
    );
    expect(result).toEqual({ ok: false, reason: "結束時間必須晚於開始時間" });
  });

  it("rejects isCrossMidnight=true when end is not actually earlier than start", () => {
    const result = checkBooking(
      slot({ date: "2026-10-09", start: "22:30", end: "23:00", isCrossMidnight: true }),
      "A",
      ctx(),
    );
    expect(result).toEqual({ ok: false, reason: "已勾選跨日，結束時間應該早於開始時間" });
  });

  it("accepts a legitimate cross-midnight slot and splits it into two checks", () => {
    const result = checkBooking(
      slot({ date: "2026-10-09", start: "22:30", end: "00:30", isCrossMidnight: true }),
      "A",
      ctx(),
    );
    expect(result).toEqual({ ok: true });
  });

  it("rejects isCrossMidnight=true when start equals end (zero-duration slot)", () => {
    const result = checkBooking(
      slot({ date: "2026-10-09", start: "14:00", end: "14:00", isCrossMidnight: true }),
      "A",
      ctx(),
    );
    expect(result).toEqual({ ok: false, reason: "已勾選跨日，結束時間應該早於開始時間" });
  });
});

describe("checkBooking against existing registered rentals", () => {
  // Room B, Monday 14:00-16:00 sits inside R5/R6's gaps (13:30-14:00,
  // 22:00-22:30), so only the registered-rental check is exercised here.
  it("rejects overlapping with an already-registered rental in the same room", () => {
    const existing = makeRental({ date: "2026-10-05", start: "14:30", end: "15:30", room: "B", status: RentalStatus.Registered });
    const result = checkBooking(
      slot({ date: "2026-10-05", start: "14:00", end: "16:00" }),
      "B",
      ctx({ existingRentals: [existing] }),
    );
    expect(result).toEqual({ ok: false, reason: "14:30–15:30 已有人預約" });
  });

  it("does not treat a pending (not yet registered) rental as blocking", () => {
    const pending = makeRental({ date: "2026-10-05", start: "14:30", end: "15:30", room: "B", status: RentalStatus.Pending });
    const result = checkBooking(
      slot({ date: "2026-10-05", start: "14:00", end: "16:00" }),
      "B",
      ctx({ existingRentals: [pending] }),
    );
    expect(result.ok).toBe(true);
  });

  it("does not block when the overlapping registered rental is in a different room", () => {
    const existing = makeRental({ date: "2026-10-05", start: "14:30", end: "15:30", room: "A", status: RentalStatus.Registered });
    const result = checkBooking(
      slot({ date: "2026-10-05", start: "14:00", end: "16:00" }),
      "B",
      ctx({ existingRentals: [existing] }),
    );
    expect(result.ok).toBe(true);
  });

  // D3 regression: a registered rental that starts the previous night and
  // spills into this morning (22:30-00:30) used to be invisible to this
  // day's blockedRanges check, since the rental's `date` field pointed at
  // the previous day. It must now block the overlapping morning slot.
  it("blocks a same-morning slot against a cross-midnight registered rental from the previous night (D3)", () => {
    const previousNight = makeRental({
      id: "previous-night",
      date: "2026-10-16",
      start: "22:30",
      end: "00:30",
      isCrossMidnight: true,
      room: "A",
      status: RentalStatus.Registered,
    });
    const result = checkBooking(
      slot({ date: "2026-10-17", start: "00:00", end: "00:30" }),
      "A",
      ctx({ existingRentals: [previousNight] }),
    );
    expect(result).toEqual({ ok: false, reason: "00:00–00:30 已有人預約" });
  });

  it("does not block a slot later that morning once the cross-midnight rental has ended (D3)", () => {
    const previousNight = makeRental({
      id: "previous-night",
      date: "2026-10-16",
      start: "22:30",
      end: "00:30",
      isCrossMidnight: true,
      room: "A",
      status: RentalStatus.Registered,
    });
    const result = checkBooking(
      slot({ date: "2026-10-17", start: "01:00", end: "02:00" }),
      "A",
      ctx({ existingRentals: [previousNight] }),
    );
    expect(result.ok).toBe(true);
  });
});

describe("getAvailableWindows", () => {
  it("returns the complement of blocked ranges for a weekday room A day", () => {
    // Monday A: R1 blocks 17:30-22:30, R3 blocks 06:00-13:30.
    const windows = getAvailableWindows("A", "2026-10-05", ctx());
    expect(windows).toEqual([
      { start: "00:00", end: "06:00" },
      { start: "13:30", end: "17:30" },
      { start: "22:30", end: "24:00" },
    ]);
  });

  it("computes the cross-midnight window from Thursday night into Friday morning", () => {
    // Thursday (2026-10-08) A: available tail after R1 ends at 22:30 -> 22:30-24:00.
    const thursdayWindows = getAvailableWindows("A", "2026-10-08", ctx());
    expect(thursdayWindows).toContainEqual({ start: "22:30", end: "24:00" });

    // Friday (2026-10-09) A: R3 (Mon-Fri, 06:00-13:30) blocks the morning,
    // R2 (Fri-Sun, 13:30-22:30) blocks the rest, leaving only 00:00-06:00 open.
    const fridayWindows = getAvailableWindows("A", "2026-10-09", ctx());
    expect(fridayWindows).toContainEqual({ start: "00:00", end: "06:00" });
  });

  it("excludes an already-registered rental's minute range from the day's windows", () => {
    const existing = makeRental({ date: "2026-10-06", start: "15:00", end: "16:00", room: "B", status: RentalStatus.Registered });
    const windows = getAvailableWindows("B", "2026-10-06", ctx({ existingRentals: [existing] }));
    expect(windows.some((w) => w.start <= "15:00" && "16:00" <= w.end)).toBe(false);
  });
});
