// Desktop shell UI state only (which windows are open, where they sit).
// Everything else — the bookings themselves — stays server-rendered and
// flows through props, same as every other page.
"use client";

import { create } from "zustand";
import type { WindowRect } from "@/components/ui/window";

export interface WindowState {
  id: string;
  open: boolean;
  rect: WindowRect;
}

interface DesktopStore {
  // Keyed by window id so a later step can add more windows without
  // reshaping this record.
  windows: Record<string, WindowState>;
  openWindow: (id: string, defaultRect: WindowRect) => void;
  closeWindow: (id: string) => void;
  toggleWindow: (id: string, defaultRect: WindowRect) => void;
  setRect: (id: string, rect: WindowRect) => void;
}

export const useDesktopStore = create<DesktopStore>((set) => ({
  windows: {},
  openWindow: (id, defaultRect) =>
    set((state) => ({
      windows: {
        ...state.windows,
        [id]: state.windows[id] ? { ...state.windows[id], open: true } : { id, open: true, rect: defaultRect },
      },
    })),
  closeWindow: (id) =>
    set((state) => {
      const existing = state.windows[id];
      if (!existing) return state;
      return { windows: { ...state.windows, [id]: { ...existing, open: false } } };
    }),
  toggleWindow: (id, defaultRect) =>
    set((state) => {
      const existing = state.windows[id];
      return {
        windows: {
          ...state.windows,
          [id]: existing ? { ...existing, open: !existing.open } : { id, open: true, rect: defaultRect },
        },
      };
    }),
  setRect: (id, rect) =>
    set((state) => {
      const existing = state.windows[id];
      if (!existing) return state;
      return { windows: { ...state.windows, [id]: { ...existing, rect } } };
    }),
}));

export function isAnyWindowOpen(windows: Record<string, WindowState>): boolean {
  return Object.values(windows).some((w) => w.open);
}
