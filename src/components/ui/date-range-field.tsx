"use client"

import { useState } from "react"
import { XIcon } from "lucide-react"
import { Calendar } from "@/components/ui/calendar"
import { controlVariants } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { calendarDateToIso, isoToCalendarDate } from "@/lib/calendar-dates"
import { isInPreview, nextDateRange, type DateRange } from "@/lib/date-range"
// Pre-existing: these are generic date helpers, not business logic, but they
// live under server/logic/. Tracked as E-16 debt (formatters move in a later
// PR per architect-synthesis.md PR 7), not fixed here.
// eslint-disable-next-line no-restricted-imports -- see comment above
import { shortDate, todayIso } from "@/server/logic/date"

interface DateRangeFieldProps {
  value: DateRange | null
  onChange: (value: DateRange | null) => void
  placeholder: string
  "aria-label": string
}

function rangeLabel(range: DateRange): string {
  return range.from === range.to ? shortDate(range.from) : `${shortDate(range.from)} – ${shortDate(range.to)}`
}

// One field for a day or a range (see nextDateRange). Every chosen day is
// its own selected tile; hovering after the first pick previews the range.
// Once a date is chosen a clear button appears; empty, the field has no icon.
export function DateRangeField({ value, onChange, placeholder, "aria-label": ariaLabel }: DateRangeFieldProps) {
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)

  return (
    <div className="relative">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          setHovered(null)
        }}
      >
        <PopoverTrigger
          aria-label={ariaLabel}
          className={`${controlVariants()} flex items-center justify-between gap-2 text-left tabular-nums ${value ? "pr-10" : ""}`}
        >
          {value ? rangeLabel(value) : <span className="text-placeholder">{placeholder}</span>}
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-0">
          <Calendar
            mode="range"
            selected={value ? { from: isoToCalendarDate(value.from), to: isoToCalendarDate(value.to) } : undefined}
            defaultMonth={value ? isoToCalendarDate(value.from) : undefined}
            onDayClick={(day) => {
              const next = nextDateRange(value, calendarDateToIso(day))
              onChange(next.range)
              setHovered(null)
              if (next.close) setOpen(false)
            }}
            onDayMouseEnter={(day) => setHovered(calendarDateToIso(day))}
            onDayMouseLeave={() => setHovered(null)}
            modifiers={{ preview: (day: Date) => isInPreview(value, hovered, calendarDateToIso(day)) }}
            modifiersClassNames={{ preview: "[&_button]:bg-selected [&_button]:opacity-60" }}
            onClear={() => {
              onChange(null)
              setOpen(false)
            }}
            onToday={() => {
              const today = todayIso()
              onChange({ from: today, to: today })
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>

      {value && (
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
