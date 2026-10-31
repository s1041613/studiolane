"use client";

import { Toggle } from "@/components/ui/toggle";
import { TimeCombobox } from "@/components/shared/schedule/time-combobox";
import { candidatesInWindows, endCandidatesAfter } from "@/components/shared/schedule/time-candidates";
import { clipWindowsToNow, getAvailableWindows, isValidHHmm } from "@/server/logic/booking-rules";
import type { RuleContext } from "@/server/logic/booking-rules";
import { addDays, shortDate } from "@/server/logic/date";
import { money } from "@/server/logic/home-selectors";
import type { SlotDraft } from "@/server/logic/booking";
import { insetVariants } from "@/components/ui/card";

interface SlotCardProps {
  slot: SlotDraft;
  room: "A" | "B";
  ruleCtx: RuleContext;
  // F-時間-0: set when a field this card depends on is still empty.
  blockedBy: string | null;
  error: string | null;
  quote: { hours: number; amount: number } | null;
  onChange: (slot: SlotDraft) => void;
  onRemove: () => void;
}

// F-時間-1..8. Windows subtract the rental rules and registered rentals.
export function SlotCard({ slot, room, ruleCtx, blockedBy, error, quote, onChange, onRemove }: SlotCardProps) {
  // F-時間-9: today's windows start from now.
  const todayWindows = clipWindowsToNow(getAvailableWindows(room, slot.date, ruleCtx), slot.date, new Date());
  const noWindows = todayWindows.length === 0;
  const startCandidates = candidatesInWindows(todayWindows);

  const endCandidates = slot.isCrossMidnight
    ? candidatesInWindows(getAvailableWindows(room, addDays(slot.date, 1), ruleCtx)).filter(
        (c) => c !== "24:00",
      )
    : isValidHHmm(slot.start)
      ? endCandidatesAfter(todayWindows, slot.start)
      : candidatesInWindows(todayWindows);

  function handleCrossMidnightToggle(checked: boolean) {
    // Clear the end time when the candidate range changes shape, so a
    // value that's no longer valid under the new range can't linger.
    onChange({ ...slot, isCrossMidnight: checked, end: "" });
  }

  const message = blockedBy ?? (noWindows ? "沒有可以預約的時段，請移除這天、改日期或換教室" : error);
  const isError = !blockedBy && (noWindows || error !== null);

  // DESIGN.md §8.2 每天的時間: a header strip (bar + date + 移除) over the
  // windows and time fields; an error sits in a red strip at the bottom.
  return (
    <div className={`${insetVariants({ padding: "none", invalid: isError })} overflow-hidden`}>
      <div className="flex items-center justify-between border-b border-inset-border bg-divider px-4 py-3">
        <h3 className="flex items-center gap-3 font-medium tabular-nums">
          <span aria-hidden className={`h-4 w-1 rounded-sm ${isError ? "bg-danger" : "bg-cal-class-bar"}`} />
          {shortDate(slot.date)}
        </h3>
        <button
          type="button"
          aria-label="移除這個時段"
          className="text-sm text-muted-foreground hover:text-destructive"
          onClick={onRemove}
        >
          移除
        </button>
      </div>

      <div className="space-y-3 px-4 py-3">
        {!blockedBy && !noWindows && (
          <>
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              可預約：
              {todayWindows.map((w) => (
                <button
                  key={w.start}
                  type="button"
                  className="h-6 rounded-sm border border-cal-available-border bg-(image:--eb-cal-available) px-2 text-foreground tabular-nums hover:border-lime-dot"
                  onClick={() => onChange({ ...slot, start: w.start, end: w.end, isCrossMidnight: false })}
                >
                  {w.start}–{w.end}
                </button>
              ))}
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <TimeCombobox
                value={slot.start}
                onChange={(start) => onChange({ ...slot, start })}
                candidates={startCandidates}
                placeholder="開始"
                invalid={isError}
              />
              <span className="text-muted-foreground">到</span>
              <TimeCombobox
                value={slot.end}
                onChange={(end) => onChange({ ...slot, end })}
                candidates={endCandidates}
                placeholder="結束"
                invalid={isError}
              />
              {/* 開關方塊: no checkbox; pressed turns #C7D0D2. */}
              <Toggle
                variant="outline"
                size="sm"
                pressed={slot.isCrossMidnight}
                onPressedChange={handleCrossMidnightToggle}
              >
                跨日
              </Toggle>
              {!message && quote && (
                <span className="ml-6 text-sm text-muted-foreground tabular-nums">
                  {quote.hours} 小時 · {money(quote.amount)}
                </span>
              )}
            </div>

            {slot.isCrossMidnight && slot.start && slot.end && (
              <p className="text-xs text-warn">
                {slot.start}–{slot.end}（跨日）
              </p>
            )}
          </>
        )}

        {!isError && message && <p className="text-sm text-muted-foreground">{message}</p>}
      </div>

      {isError && message && (
        <p className="border-t border-inset-border bg-danger-bg px-4 py-2 text-sm text-danger">{message}</p>
      )}
    </div>
  );
}
