import { describe, expect, it } from "vitest";
import {
  fromNaiveUtcTimestamp,
  fromStartsEndsAt,
  intervalsOverlap,
  paymentMethodFromLabel,
  paymentMethodToLabel,
  paymentStateFromLabel,
  paymentStateToLabel,
  purposeFromLabel,
  purposeToLabel,
  statusFromLabel,
  statusToLabel,
  toStartsEndsAt,
} from "@/server/supabase/codecs";

describe("purpose codec", () => {
  it("round-trips every DB code through its Chinese label", () => {
    const codes = [
      "dance",
      "private_lesson",
      "performance",
      "aerobics",
      "front_desk",
      "workshop",
      "photography",
      "yoga",
    ] as const;
    for (const code of codes) {
      expect(purposeFromLabel(purposeToLabel(code))).toBe(code);
    }
  });

  it("returns null for an unknown label", () => {
    expect(purposeFromLabel("不存在的用途")).toBeNull();
  });
});

describe("rental_status codec", () => {
  it("round-trips every DB code through its Chinese label", () => {
    const codes = [
      "pending",
      "awaiting_payment",
      "registered",
      "completed",
      "postponed",
      "cancelled",
    ] as const;
    for (const code of codes) {
      expect(statusFromLabel(statusToLabel(code))).toBe(code);
    }
  });
});

describe("payment_state codec", () => {
  it("round-trips unpaid/paid/not_required", () => {
    expect(paymentStateFromLabel(paymentStateToLabel("unpaid"))).toBe("unpaid");
    expect(paymentStateFromLabel(paymentStateToLabel("paid"))).toBe("paid");
    expect(paymentStateFromLabel(paymentStateToLabel("not_required"))).toBe("not_required");
  });
});

describe("payment_method codec", () => {
  it("round-trips on_site/transfer", () => {
    expect(paymentMethodFromLabel(paymentMethodToLabel("on_site"))).toBe("on_site");
    expect(paymentMethodFromLabel(paymentMethodToLabel("transfer"))).toBe("transfer");
  });

  it("no longer recognises 免費 as a payment method (DB-1)", () => {
    expect(paymentMethodFromLabel("免費")).toBeNull();
  });
});

describe("toStartsEndsAt / fromStartsEndsAt", () => {
  it("round-trips a same-day booking", () => {
    const interval = toStartsEndsAt("2026-10-16", "14:00", "16:00", false);
    expect(fromStartsEndsAt(interval)).toEqual({
      date: "2026-10-16",
      start: "14:00",
      end: "16:00",
      isCrossMidnight: false,
    });
  });

  it("rolls the end time to the next day when isCrossMidnight is set, even if end > start", () => {
    // 22:00 -> 23:30 same night, but marked cross-midnight by a form mistake
    // or an explicit late-night-to-very-early-morning booking the next day.
    const interval = toStartsEndsAt("2026-10-16", "22:00", "23:30", true);
    const recovered = fromStartsEndsAt(interval);
    expect(recovered.isCrossMidnight).toBe(true);
    expect(recovered.end).toBe("23:30");
  });

  it("handles the 23:59 -> 00:01 cross-midnight boundary", () => {
    const interval = toStartsEndsAt("2026-10-16", "23:59", "00:01", true);
    const recovered = fromStartsEndsAt(interval);
    expect(recovered).toEqual({
      date: "2026-10-16",
      start: "23:59",
      end: "00:01",
      isCrossMidnight: true,
    });
  });

  it("never infers cross-midnight from end < start; isCrossMidnight is read verbatim", () => {
    // Same-day input error (14:00 -> 13:00) without the cross-midnight flag:
    // toStartsEndsAt must NOT silently roll this to the next day.
    const interval = toStartsEndsAt("2026-10-16", "14:00", "13:00", false);
    expect(interval.endsAt.getTime()).toBeLessThan(interval.startsAt.getTime());
  });
});

describe("intervalsOverlap", () => {
  const at = (date: string, start: string, end: string, cross = false) =>
    toStartsEndsAt(date, start, end, cross);

  it("detects a same-day overlap", () => {
    const a = at("2026-10-16", "10:00", "12:00");
    const b = at("2026-10-16", "11:00", "13:00");
    expect(intervalsOverlap(a, b)).toBe(true);
  });

  it("does not consider back-to-back intervals as overlapping (half-open [start,end))", () => {
    const a = at("2026-10-16", "10:00", "11:00");
    const b = at("2026-10-16", "11:00", "12:00");
    expect(intervalsOverlap(a, b)).toBe(false);
    expect(intervalsOverlap(b, a)).toBe(false);
  });

  it("detects the cross-midnight conflict that date-string comparison used to miss (D3)", () => {
    // 10/16 22:30-00:30 (cross-midnight) vs 10/17 00:00-00:30 (same day):
    // comparing by `date` field alone (0006-era logic) never caught this,
    // because the first rental's `date` column was "2026-10-16".
    const previousNight = at("2026-10-16", "22:30", "00:30", true);
    const nextMorning = at("2026-10-17", "00:00", "00:30");
    expect(intervalsOverlap(previousNight, nextMorning)).toBe(true);
  });

  it("does not flag a cross-midnight booking against a later, non-overlapping same-day slot", () => {
    const previousNight = at("2026-10-16", "22:30", "00:30", true);
    const laterThatMorning = at("2026-10-17", "01:00", "02:00");
    expect(intervalsOverlap(previousNight, laterThatMorning)).toBe(false);
  });
});

describe("fromNaiveUtcTimestamp", () => {
  it("reads an offset-less created_at as UTC, not as the demo_reader's local time", () => {
    // Submitted at 23:43 Taipei; Postgres `timestamp` drops the Z on write.
    expect(fromNaiveUtcTimestamp("2026-10-10T15:43:43.123")).toBe("2026-10-10T15:43:43.123Z");
  });
});
