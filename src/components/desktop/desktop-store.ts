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
import {
  INITIAL_KOBEYEE_SESSION,
  reduceKobeyee,
  type KobeyeeEvent,
  type KobeyeeReader,
  type KobeyeeSession,
} from "@/components/desktop/kobeyee-session";

// A window's open/closed state used to live here too, but for 預約冊 it now
// follows the URL (see BookingsWindow) so there's no second copy that can
// drift from the route. Only the rect — position/size — still persists
// across opens within the session.
interface WindowRectState {
  id: string;
  rect: WindowRect;
}

interface DesktopStore {
  // Keyed by window id so a later step can add more windows without
  // reshaping this record.
  windows: Record<string, WindowRectState>;
  // A window has no entry until its first drag or resize; until then it
  // renders at its own CSS default placement.
  setRect: (id: string, rect: WindowRect) => void;

  widgets: WidgetPlacement[];
  editingWidgets: boolean;
  setEditingWidgets: (editing: boolean) => void;
  // Places the widget in the first free cell of a grid `columnCount` wide.
  addWidget: (kind: WidgetKind, columnCount: number) => void;
  removeWidget: (kind: WidgetKind) => void;
  moveWidget: (kind: WidgetKind, cell: GridCell) => void;

  // Kobeyee lives outside `windows`: its rect is derived from its session.
  kobeyee: KobeyeeSession;
  dispatchKobeyee: (event: KobeyeeEvent) => void;
  sendToKobeyee: (text: string, reader: KobeyeeReader) => Promise<void>;
}

// Only the widget layout survives a reload; windows always start closed.
const STORAGE_KEY = "studiolane-desktop";

export const useDesktopStore = create<DesktopStore>()(
  persist(
    (set, get) => ({
      windows: {},
      setRect: (id, rect) => set((state) => ({ windows: { ...state.windows, [id]: { id, rect } } })),

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

      kobeyee: INITIAL_KOBEYEE_SESSION,
      dispatchKobeyee: (event) => set((state) => ({ kobeyee: reduceKobeyee(state.kobeyee, event) })),
      sendToKobeyee: async (text, reader) => {
        get().dispatchKobeyee({ type: "send", text });
        const requestId = get().kobeyee.requestSeq;
        const result = await reader(text);
        get().dispatchKobeyee({ type: "resolved", requestId, result });
      },
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

// Kobeyee is the only window still tracked here; every other window (just
// 預約冊 today) has its open state derived from the URL instead, so callers
// pass that in rather than this reading it from `windows`.
export function isAnyWindowOpen(kobeyeeOpen: boolean, otherWindowOpen: boolean): boolean {
  return kobeyeeOpen || otherWindowOpen;
}
