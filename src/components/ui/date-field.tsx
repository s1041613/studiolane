"use client"

import { useState } from "react"
import { XIcon } from "lucide-react"
import { Calendar } from "@/components/ui/calendar"
import { controlVariants } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { calendarDateToIso, isoToCalendarDate } from "@/lib/calendar-dates"
// Pre-existing: these are generic date helpers, not business logic, but they
// live under server/logic/. Tracked as E-16 debt (formatters move in a later
// PR per architect-synthesis.md PR 7), not fixed here.
// eslint-disable-next-line no-restricted-imports -- see comment above
import { shortDate, todayIso } from "@/server/logic/date"
// eslint-disable-next-line no-restricted-imports -- see comment above
import type { IsoDate } from "@/server/logic/booking"

interface DateFieldProps {
  value: IsoDate | null
  onChange: (value: IsoDate | null) => void
  placeholder: string
  id?: string
  disabled?: boolean
  // Days that can't be picked (e.g. before today).
  isDateDisabled?: (date: IsoDate) => boolean
  "aria-invalid"?: boolean
  "aria-describedby"?: string
  "aria-label"?: string
}

// DESIGN.md §5.5: the one-day picker. Same calendar as 預約教室 and the
// same field as DateRangeField; never the browser's <input type="date">.
export function DateField({
  value,
  onChange,
  placeholder,
  id,
  disabled,
  isDateDisabled,
  ...aria
}: DateFieldProps) {
  const [open, setOpen] = useState(false)

  function pick(next: IsoDate | null) {
    onChange(next)
    setOpen(false)
  }

  return (
    <div className="relative">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          id={id}
          disabled={disabled}
          aria-invalid={aria["aria-invalid"] || undefined}
          aria-describedby={aria["aria-describedby"]}
          aria-label={aria["aria-label"]}
          className={`${controlVariants({ variant: disabled ? "pending" : "default" })} flex items-center text-left tabular-nums ${value && !disabled ? "pr-10" : ""}`}
        >
          {value ? shortDate(value) : <span className="text-placeholder">{placeholder}</span>}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="single"
            selected={value ? isoToCalendarDate(value) : undefined}
            defaultMonth={value ? isoToCalendarDate(value) : undefined}
            disabled={isDateDisabled && ((day: Date) => isDateDisabled(calendarDateToIso(day)))}
            onSelect={(day) => day && pick(calendarDateToIso(day))}
            onClear={() => pick(null)}
            onToday={() => pick(todayIso())}
          />
        </PopoverContent>
      </Popover>

      {value && !disabled && (
        <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center">
          <button
            type="button"
            aria-label="清除日期"
            onClick={() => onChange(null)}
            className="pointer-events-auto grid size-6 place-items-center rounded-md bg-inset text-text-secondary hover:bg-selected"
          >
            <XIcon className="size-3.5" />
          </button>
        </span>
      )}
    </div>
  )
}
