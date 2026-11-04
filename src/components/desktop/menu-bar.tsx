"use client";

import { useEffect, useState } from "react";
import { Logo } from "@/components/ui/logo";

// The menu bar's height in pixels; Dock/Window layout reads this constant
// so a window can never be dragged above it.
export const MENU_BAR_HEIGHT = 24;

function formatClock(date: Date): string {
  return new Intl.DateTimeFormat("zh-Hant-TW", {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function useClock(): string {
  const [label, setLabel] = useState(() => formatClock(new Date()));

  useEffect(() => {
    const id = setInterval(() => setLabel(formatClock(new Date())), 15_000);
    return () => clearInterval(id);
  }, []);

  return label;
}

function MenuBar() {
  const clock = useClock();

  return (
    <header
      style={{ height: MENU_BAR_HEIGHT }}
      className="fixed inset-x-0 top-0 z-[5000] flex items-center gap-[7px] bg-white/16 px-3.5 text-[13px] text-white backdrop-blur-xl backdrop-saturate-[1.7]"
    >
      <Logo className="text-sm text-white" />
      <span className="font-bold">studiolane</span>
      <time className="ml-auto tabular-nums">{clock}</time>
    </header>
  );
}

export { MenuBar };
