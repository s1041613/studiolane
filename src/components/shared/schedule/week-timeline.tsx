import { cn } from "@/lib/utils";
import { toMinutes } from "@/server/logic/booking-rules";
import type { HHmm } from "@/server/logic/booking";
import { insetVariants } from "@/components/ui/card";

// A week drawn as seven day columns on a shared time axis. It knows nothing
// about rules or classes: 租借時段 draws its rows here, 課表 draws its classes.

// DESIGN.md §5.4 行事曆顏色: 不能租 is always grey stripes and 可租 always
// lime; a one-day rule adds the dashed frame. muted = weekly 不能租,
// block = one-day 不能租, open = one-day 例外開放, accent = something placed
// on top (a class), special = a special course (violet bar).
export type TimelineTone = "muted" | "block" | "open" | "accent" | "special";

export type TimelineItem = {
  id: string;
  start: HHmm;
  end: HHmm;
  label: string;
  tone: TimelineTone;
  // Lifted for that day (a weekly row an opening covers): drawn 45% fainter.
  struck?: boolean;
  // Clickable items (課表's classes) open their editor; the label names it for screen readers.
  onSelect?: () => void;
  // Shown after the label, e.g. ⚠ for a class that needs changing.
  marker?: string;
};

export type TimelineDay = { key: string; label: string; items: TimelineItem[] };

const TONE_CLASS: Record<TimelineTone, string> = {
  muted: "bg-(image:--eb-cal-blocked) text-text-secondary",
  block: "bg-(image:--eb-cal-blocked) text-text-secondary border border-dashed border-cal-oneday-border",
  open: "bg-(image:--eb-cal-available) text-foreground border border-dashed border-cal-oneday-border",
  accent: "bg-cal-class text-cal-class-text border-l-3 border-cal-class-bar",
  special: "bg-(image:--eb-cal-special-bg) text-cal-class-text border-l-3 border-cal-special",
};

const DAY_END = 24 * 60;
const DEFAULT_FROM = 6 * 60;
const TICK = 4 * 60;

// The axis runs to 24:00 and starts at 06:00, or at the even hour before the
// earliest item when something starts sooner.
export function timelineAxis(days: readonly TimelineDay[]): { from: number; to: number; ticks: number[] } {
  const earliest = Math.min(DEFAULT_FROM, ...days.flatMap((d) => d.items.map((i) => toMinutes(i.start))));
  const from = earliest < DEFAULT_FROM ? Math.floor(earliest / 120) * 120 : DEFAULT_FROM;
  const ticks: number[] = [];
  for (let m = from; m < DAY_END; m += TICK) ticks.push(m / 60);
  return { from, to: DAY_END, ticks };
}

// 課表 (DESIGN.md §5.4 課表週視圖的範圍): from the hour of the week's
// earliest item to the hour after its latest end, one tick per hour, so
// empty mornings and nights aren't drawn. null for an empty week.
export function fitAxis(days: readonly TimelineDay[]): { from: number; to: number; ticks: number[] } | null {
  const items = days.flatMap((d) => d.items);
  if (items.length === 0) return null;
  const from = Math.floor(Math.min(...items.map((i) => toMinutes(i.start))) / 60) * 60;
  const to = Math.min(DAY_END, Math.ceil(Math.max(...items.map((i) => toMinutes(i.end))) / 60) * 60);
  const ticks: number[] = [];
  for (let m = from; m < to; m += 60) ticks.push(m / 60);
  return { from, to, ticks };
}

// 課表: every hour is 80px so a block fits「時間＋課名｜老師」on up to three lines.
const FIT_HOUR_PX = 80;

function itemTitle(item: TimelineItem): string {
  return `${item.start}–${item.end} ${item.label}${item.struck ? "（這天被蓋掉）" : ""}`;
}

// `available`: 租借時段's columns are lime wherever no rule says 不能租.
// `fit`: 課表's range and scale (fitAxis, 80px an hour), with the weekday row
// sticking to the top of the scrolling card.
export function WeekTimeline({
  days,
  background = "plain",
  fit = false,
  className,
}: {
  days: readonly TimelineDay[];
  background?: "plain" | "available";
  fit?: boolean;
  className?: string;
}) {
  const fitted = fit ? fitAxis(days) : null;
  const { from, to, ticks } = fitted ?? timelineAxis(days);
  const span = to - from;
  const columnHeight = fitted ? { height: `${(span / 60) * FIT_HOUR_PX}px` } : undefined;
  const columnClass = fitted ? "relative" : "relative h-[28rem]";
  // Each block is inset 2px top and bottom, so back-to-back blocks
  // (06:00–13:30, 13:30–22:30) keep a 4px gap (DESIGN.md §5.4 行事曆時段方塊).
  const top = (hhmm: HHmm) => `calc(${((Math.max(toMinutes(hhmm), from) - from) / span) * 100}% + 2px)`;
  const height = (item: TimelineItem) =>
    `calc(${((Math.min(toMinutes(item.end), to) - Math.max(toMinutes(item.start), from)) / span) * 100}% - 4px)`;

  return (
    <div className={cn("grid grid-cols-[2.5rem_repeat(7,minmax(0,1fr))] gap-x-1 text-xs", className)}>
      <div className={cn(fit && "sticky top-0 z-20 bg-surface-solid")} />
      {days.map((day) => (
        <div key={day.key} className={cn("pb-1 text-center font-medium", fit && "sticky top-0 z-20 bg-surface-solid pt-1")}>
          {day.label}
        </div>
      ))}

      <div className={columnClass} style={columnHeight} aria-hidden>
        {ticks.map((hour) => (
          <span
            key={hour}
            // The first hour hangs below its line so the weekday row can't cover it.
            className={cn("absolute right-1 font-mono text-muted-foreground", hour * 60 > from && "-translate-y-1/2")}
            style={{ top: `${((hour * 60 - from) / span) * 100}%` }}
          >
            {String(hour).padStart(2, "0")}
          </span>
        ))}
      </div>
      {days.map((day) => (
        <ul
          key={day.key}
          aria-label={day.label}
          style={columnHeight}
          className={cn(
            columnClass,
            insetVariants({ padding: "none" }),
            background === "available" && "border-cal-available-border bg-(image:--eb-cal-available)",
          )}
        >
          {day.items.map((item) => (
            <li
              key={item.id}
              title={itemTitle(item)}
              className={cn(
                "absolute inset-x-0.5 overflow-hidden rounded px-1 py-0.5 leading-tight",
                TONE_CLASS[item.tone],
                item.struck && "opacity-55",
                item.tone !== "muted" && "z-10",
              )}
              style={{ top: top(item.start), height: height(item) }}
            >
              {item.onSelect ? (
                <button type="button" className="block size-full text-left" onClick={item.onSelect}>
                  <span className="sr-only">{itemTitle(item)}</span>
                  <span aria-hidden>
                    {item.label}
                    {item.marker && ` ${item.marker}`}
                  </span>
                </button>
              ) : (
                <>
                  <span className="sr-only">{itemTitle(item)}</span>
                  <span aria-hidden>{item.label}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}
