"use client";

import { TimeCombobox } from "@/components/shared/schedule/time-combobox";
import { allDayCandidates } from "@/components/shared/schedule/time-candidates";
import { normalizeTimeInput } from "@/server/logic/scheduling-range";

type TimeRangePickerProps = {
  // Prefix for the two pickers' ids; `${id}-start` is what a <label> points at.
  id: string;
  start: string;
  end: string;
  onChange: (range: { start: string; end: string }) => void;
  // From timeRangeError(): 10-minute steps, same day, end after start.
  error?: string;
  disabled?: boolean;
};

const CANDIDATES = allDayCandidates();

// A same-day 開始／結束 pair for the settings forms (上課時段、租借規則、課程),
// built from 預約教室's TimeCombobox so every time field in the app looks and
// works the same (docs/rental-time-rules D8). Any half hour can be picked;
// 13:40 can still be typed, and closing the list tidies 「1330」 into 「13:30」.
export function TimeRangePicker({ id, start, end, onChange, error, disabled }: TimeRangePickerProps) {
  const describedBy = error ? `${id}-error` : undefined;
  const picker = (which: "start" | "end", value: string, label: string) => (
    <TimeCombobox
      id={`${id}-${which}`}
      aria-label={label}
      value={value}
      candidates={CANDIDATES}
      placeholder={which === "start" ? "13:30" : "22:30"}
      invalid={Boolean(error)}
      describedBy={describedBy}
      disabled={disabled}
      normalize={normalizeTimeInput}
      onChange={(next) => onChange({ start, end, [which]: next })}
    />
  );

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        {picker("start", start, "開始")}
        <span aria-hidden className="text-muted-foreground">
          –
        </span>
        {picker("end", end, "結束")}
      </div>
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
