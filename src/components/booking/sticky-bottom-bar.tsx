"use client";

import { ActionButton } from "@/components/ui/action-button";
import { money } from "@/server/logic/home-selectors";

interface StickyBottomBarProps {
  slotCount: number;
  totalHours: number;
  totalAmount: number;
  onSubmit: () => Promise<void>;
}

// F-總額-1. S-錯誤-1: the submit button is never greyed out for errors — it
// runs the checks and says what's missing instead. It only locks while a
// submission is in flight (BTN-2).
export function StickyBottomBar({ slotCount, totalHours, totalAmount, onSubmit }: StickyBottomBarProps) {
  return (
    <div className="sticky bottom-4 -mx-2 mt-6 flex items-center justify-between rounded-xl border border-surface-border bg-surface-solid px-[18px] py-4">
      <div>
        <div className="text-sm text-muted-foreground">
          {slotCount} 個時段 · {totalHours} 小時
        </div>
        <div className="text-lg font-medium tabular-nums">{money(totalAmount)}</div>
      </div>
      <ActionButton type="button" size="lg" onClick={onSubmit}>
        送出預約
      </ActionButton>
    </div>
  );
}
