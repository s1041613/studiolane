// Desktop shell UI state only (which windows are open, where they sit, which
// widgets are on the desktop and in which cell). Everything else — the
// bookings themselves — stays server-rendered and flows through props, same
// as every other page.
"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { WindowRect } from "@/components/ui/window";
import { firstFreeCell } from "@/components/ui/widget-grid-layout";
import type { GridCell } from "@/components/ui/widget-grid-layout";
import { DEFAULT_WIDGETS, WIDGET_SPAN, isWidgetKind, toGridPlacements } from "@/components/desktop/widget-kinds";
import type { WidgetKind, WidgetPlacement } from "@/components/desktop/widget-kinds";

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

  widgets: WidgetPlacement[];
  editingWidgets: boolean;
  setEditingWidgets: (editing: boolean) => void;
  // Places the widget in the first free cell of a grid `columnCount` wide.
  addWidget: (kind: WidgetKind, columnCount: number) => void;
  removeWidget: (kind: WidgetKind) => void;
  moveWidget: (kind: WidgetKind, cell: GridCell) => void;
}

// Only the widget layout survives a reload; windows always start closed.
const STORAGE_KEY = "studiolane-desktop";

export const useDesktopStore = create<DesktopStore>()(
  persist(
    (set) => ({
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

      widgets: DEFAULT_WIDGETS,
      editingWidgets: false,
      setEditingWidgets: (editing) => set({ editingWidgets: editing }),
      addWidget: (kind, columnCount) =>
        set((state) => {
          if (state.widgets.some((widget) => widget.kind === kind)) return state;
          const cell = firstFreeCell(toGridPlacements(state.widgets), WIDGET_SPAN[kind], columnCount);
          return { widgets: [...state.widgets, { kind, ...cell }] };
        }),
      removeWidget: (kind) => set((state) => ({ widgets: state.widgets.filter((widget) => widget.kind !== kind) })),
      moveWidget: (kind, cell) =>
        set((state) => ({
          widgets: state.widgets.map((widget) => (widget.kind === kind ? { kind, ...cell } : widget)),
        })),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      partialize: (state) => ({ widgets: state.widgets }),
      // A stored layout from an older build may name a widget that no
      // longer exists; drop those rather than render nothing for them.
      merge: (persisted, current) => ({ ...current, widgets: readStoredWidgets(persisted) ?? current.widgets }),
      // The server renders the default layout; the stored one is applied
      // after mount (DesktopWidgets calls rehydrate) so hydration matches.
      skipHydration: true,
    },
  ),
);

function readStoredWidgets(persisted: unknown): WidgetPlacement[] | null {
  if (typeof persisted !== "object" || persisted === null || !("widgets" in persisted)) return null;
  const { widgets } = persisted;
  if (!Array.isArray(widgets)) return null;
  return widgets.filter(
    (widget): widget is WidgetPlacement =>
      typeof widget === "object" &&
      widget !== null &&
      isWidgetKind(widget.kind) &&
      Number.isInteger(widget.column) &&
      Number.isInteger(widget.row),
  );
}

export function isAnyWindowOpen(windows: Record<string, WindowState>): boolean {
  return Object.values(windows).some((w) => w.open);
}
