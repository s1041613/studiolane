"use client";

import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { insetVariants } from "@/components/ui/card";
import { controlVariants } from "@/components/ui/input";
import { calendarDateToIso, isoToCalendarDate } from "@/lib/calendar-dates";
import { shortDate } from "@/server/logic/date";
import type { IsoDate } from "@/server/logic/booking";

interface MultiDatePickerProps {
  dates: IsoDate[];
  onChange: (dates: IsoDate[]) => void;
  // F-日期-2/3: past dates and dates with no window in either room.
  isDateDisabled: (date: IsoDate) => boolean;
  invalid?: boolean;
}

const toIso = (d: Date): IsoDate => calendarDateToIso(d);
const fromIso = isoToCalendarDate;

export function MultiDatePicker({ dates, onChange, isDateDisabled, invalid }: MultiDatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = dates.map(fromIso);

  // DESIGN.md §8.2 日期: one input-height field, chosen dates on the left,
  // the calendar trigger on the right.
  return (
    <div
      aria-invalid={invalid || undefined}
      className={`${controlVariants({ size: "auto" })} flex flex-wrap items-center gap-1.5`}
    >
      {dates.map((d) => (
        <span
          key={d}
          className={`${insetVariants({ padding: "none" })} inline-flex h-8 items-center gap-2 rounded-md pr-2 pl-3 text-sm tabular-nums`}
        >
          {shortDate(d)}
          <button
            type="button"
            aria-label={`移除 ${shortDate(d)}`}
            className="text-muted-foreground hover:text-foreground"
            onClick={() => onChange(dates.filter((x) => x !== d))}
          >
            ×
          </button>
        </span>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={<Button variant="outline" size="sm" type="button" className="ml-auto" />}>
          <CalendarIcon aria-hidden />
          {dates.length ? `已選 ${dates.length} 天` : "選擇日期"}
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-0">
          <Calendar
            mode="multiple"
            selected={selected}
            disabled={(day) => isDateDisabled(toIso(day))}
            onSelect={(days) => onChange((days ?? []).map(toIso).sort())}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
