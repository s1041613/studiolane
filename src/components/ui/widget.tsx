"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "cn";

// A frosted desktop widget card, inspired by phone home-screen widgets. It
// fills whatever box the grid gives it; in edit mode it wobbles and shows a
// round − button at its top-left corner.
interface WidgetProps {
  label: string;
  tone?: "light" | "dark";
  editing: boolean;
  onRemove: () => void;
  removeLabel: string;
  children: ReactNode;
}

const TONE_CLASS = {
  light: "bg-[rgba(244,247,252,0.7)] text-foreground",
  dark: "bg-[rgba(14,20,44,0.42)] text-[rgba(235,235,245,0.72)]",
} as const;

// How far the card swings each way in edit mode.
const WOBBLE_DEGREES = 1;

function Widget({ label, tone = "light", editing, onRemove, removeLabel, children }: WidgetProps) {
  const reduceMotion = useReducedMotion();
  const wobble = editing && !reduceMotion;

  return (
    <motion.div
      className="relative size-full"
      animate={wobble ? { rotate: [-WOBBLE_DEGREES, WOBBLE_DEGREES] } : { rotate: 0 }}
      transition={
        wobble
          ? { duration: 0.28, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }
          : { duration: 0.15 }
      }
    >
      <section
        aria-label={label}
        className={cn(
          "size-full overflow-hidden rounded-[26px] px-4 py-[15px] font-sans tabular-nums shadow-[0_14px_34px_-14px_rgba(0,16,50,0.6),0_2px_8px_rgba(0,16,50,0.14)] backdrop-blur-[26px] backdrop-saturate-[1.7]",
          TONE_CLASS[tone],
          editing && "pointer-events-none select-none",
        )}
      >
        {children}
      </section>
      {editing && (
        <button
          type="button"
          aria-label={removeLabel}
          onClick={onRemove}
          // Keeps the press from starting a drag of the widget underneath.
          onPointerDown={(event) => event.stopPropagation()}
          className="absolute -top-2 -left-2 z-10 grid size-[26px] place-items-center rounded-full bg-[linear-gradient(180deg,#fdfdfd,#d8d8dc)] pb-0.5 text-[22px] leading-none text-foreground shadow-[inset_0_1px_0_#fff,0_0_0_0.5px_rgba(0,0,0,0.35),0_2px_6px_rgba(0,0,0,0.35)]"
        >
          −
        </button>
      )}
    </motion.div>
  );
}

// The round + that opens the widget gallery while the desktop is in edit mode.
function WidgetAddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid size-[30px] place-items-center rounded-full bg-[linear-gradient(180deg,#fdfdfd,#d8d8dc)] pb-0.5 text-[24px] leading-none text-foreground shadow-[inset_0_1px_0_#fff,0_0_0_0.5px_rgba(0,0,0,0.35),0_2px_6px_rgba(0,0,0,0.35)]"
    >
      +
    </button>
  );
}

// The small coloured label at a widget's top-left (今日教室's date, 待付款, …).
function WidgetEyebrow({ className, children }: { className?: string; children: ReactNode }) {
  return <p className={cn("text-[12.5px] leading-tight font-semibold", className)}>{children}</p>;
}

export { Widget, WidgetAddButton, WidgetEyebrow };
