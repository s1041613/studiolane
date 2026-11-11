"use client";

import * as React from "react";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Widget, WidgetAddButton } from "@/components/ui/widget";
import { WidgetGallery } from "@/components/ui/widget-gallery";
import { WIDGET_CELL, WIDGET_COLUMN_GAP, WIDGET_ROW_GAP, WidgetGrid, widgetColumnsForWidth, widgetSlotSize } from "@/components/ui/widget-grid";
import { MENU_BAR_HEIGHT } from "@/components/desktop/menu-bar";
import { useDesktopStore } from "@/components/desktop/desktop-store";
import { DEFAULT_WIDGETS, WIDGET_KINDS, WIDGET_NAME, WIDGET_SPAN, isWidgetKind } from "@/components/desktop/widget-kinds";
import type { WidgetKind } from "@/components/desktop/widget-kinds";
import { TodayWidget } from "@/components/desktop/today-widget";
import { UnpaidWidget } from "@/components/desktop/unpaid-widget";
import { FreeSlotWidget } from "@/components/desktop/free-slot-widget";
import { useNow } from "@/components/desktop/use-now";
import type { RentalSummary } from "@/server/types/home";
import type { RentalRule } from "@/server/logic/booking-rules";

// Where the grid starts, and the strip kept clear on the right.
const GRID_LEFT = 32;
const GRID_TOP = MENU_BAR_HEIGHT + 56;
const GRID_RIGHT_CLEARANCE = 60;

const WIDGET_TONE: Record<WidgetKind, "light" | "dark"> = {
  today: "light",
  unpaid: "dark",
  free: "dark",
};

function subscribeToResize(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

function useColumnCount(): number {
  const width = React.useSyncExternalStore(
    subscribeToResize,
    () => window.innerWidth,
    () => 1280,
  );
  return widgetColumnsForWidth(width - GRID_LEFT - GRID_RIGHT_CLEARANCE);
}

interface WidgetBodyProps {
  kind: WidgetKind;
  // Null when the rentals or rules failed to load; each widget then shows —.
  rentals: readonly RentalSummary[] | null;
  rules: readonly RentalRule[] | null;
  now: Date | null;
}

function WidgetBody({ kind, rentals, rules, now }: WidgetBodyProps) {
  switch (kind) {
    case "today":
      return <TodayWidget rentals={rentals} now={now} />;
    case "unpaid":
      return <UnpaidWidget rentals={rentals} />;
    case "free":
      return <FreeSlotWidget rentals={rentals} rules={rules} now={now} />;
  }
}

// The widgets' data, resolved from DesktopShell's sectionsPromise. Each
// field is null when that read failed; the widget itself then shows —.
export interface DesktopSections {
  rentals: readonly RentalSummary[] | null;
  rules: readonly RentalRule[] | null;
}

interface DesktopWidgetsProps extends DesktopSections {
  hidden: boolean;
}

// The widget layer on the desktop. Right-click opens the edit menu; in edit
// mode widgets wobble, drag between cells and show −, the + opens the
// gallery, and a click on empty desktop (or Esc) ends editing.
function DesktopWidgets({ hidden, rentals, rules }: DesktopWidgetsProps) {
  const widgets = useDesktopStore((state) => state.widgets);
  const editing = useDesktopStore((state) => state.editingWidgets);
  const setEditing = useDesktopStore((state) => state.setEditingWidgets);
  const addWidget = useDesktopStore((state) => state.addWidget);
  const removeWidget = useDesktopStore((state) => state.removeWidget);
  const moveWidget = useDesktopStore((state) => state.moveWidget);
  const columnCount = useColumnCount();
  const now = useNow();
  const [hydrated, setHydrated] = React.useState(false);
  const [menuTarget, setMenuTarget] = React.useState<WidgetKind | null>(null);
  const [galleryOpen, setGalleryOpen] = React.useState(false);

  React.useEffect(() => {
    void Promise.resolve(useDesktopStore.persist.rehydrate()).then(() => setHydrated(true));
  }, []);

  React.useEffect(() => {
    if (!editing) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setEditing(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [editing, setEditing]);

  const missing = WIDGET_KINDS.filter((kind) => !widgets.some((widget) => widget.kind === kind));

  function openGallery() {
    setEditing(true);
    setGalleryOpen(true);
  }

  const items = widgets.map(({ kind, column, row }) => ({
    id: kind,
    span: WIDGET_SPAN[kind],
    column,
    row,
    content: (
      <Widget
        label={WIDGET_NAME[kind]}
        tone={WIDGET_TONE[kind]}
        editing={editing}
        onRemove={() => removeWidget(kind)}
        removeLabel={`移除「${WIDGET_NAME[kind]}」`}
      >
        <WidgetBody kind={kind} rentals={rentals} rules={rules} now={now} />
      </Widget>
    ),
  }));

  return (
    <ContextMenu>
      <ContextMenuTrigger
        className="absolute inset-0 transition-opacity duration-300"
        // Behind an open window the widgets are faded out and out of reach:
        // no pointer, no focus, nothing for assistive tech.
        inert={hidden}
        style={{ opacity: hidden || !hydrated ? 0 : 1 }}
        onContextMenu={(event) => {
          const id = (event.target as HTMLElement).closest("[data-widget-id]")?.getAttribute("data-widget-id");
          setMenuTarget(isWidgetKind(id) ? id : null);
        }}
        onPointerDown={(event) => {
          if (editing && event.button === 0 && !(event.target as HTMLElement).closest("[data-widget-id],button")) {
            setEditing(false);
          }
        }}
      >
        {editing && missing.length > 0 && (
          <div className="absolute" style={{ left: GRID_LEFT - 12, top: GRID_TOP - 48 }}>
            <WidgetAddButton label="加入小工具" onClick={openGallery} />
          </div>
        )}
        <div className="absolute" style={{ left: GRID_LEFT, top: GRID_TOP }}>
          <WidgetGrid
            items={items}
            columnCount={columnCount}
            editing={editing}
            onMove={(id, cell) => {
              if (isWidgetKind(id)) moveWidget(id, cell);
            }}
          />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {menuTarget && (
          <>
            <ContextMenuItem onClick={() => setEditing(true)}>編輯小工具</ContextMenuItem>
            <ContextMenuItem onClick={() => removeWidget(menuTarget)}>移除「{WIDGET_NAME[menuTarget]}」</ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuItem disabled={missing.length === 0} onClick={openGallery}>
          加入小工具…
        </ContextMenuItem>
        {!menuTarget && <ContextMenuItem onClick={() => setEditing(true)}>編輯桌面</ContextMenuItem>}
      </ContextMenuContent>
      <WidgetGallery
        open={galleryOpen && missing.length > 0}
        onOpenChange={setGalleryOpen}
        options={missing.map((kind) => ({
          id: kind,
          name: WIDGET_NAME[kind],
          preview: (
            <div style={widgetSlotSize(WIDGET_SPAN[kind])}>
              <Widget label={WIDGET_NAME[kind]} tone={WIDGET_TONE[kind]} editing={false} onRemove={() => {}} removeLabel="">
                <WidgetBody kind={kind} rentals={rentals} rules={rules} now={now} />
              </Widget>
            </div>
          ),
        }))}
        onAdd={(id) => {
          if (isWidgetKind(id)) addWidget(id, columnCount);
          setGalleryOpen(false);
        }}
      />
    </ContextMenu>
  );
}

// One ghost widget frame: a translucent empty box with a slow light sweep,
// at the exact size and position its real widget will take. Reuses the
// skeleton-shimmer keyframe (ui/skeleton.tsx) rather than inventing a
// second sweep animation, just lighter so it reads on the wallpaper instead
// of on a card.
function WidgetGhost({ left, top, width, height }: { left: number; top: number; width: number; height: number }) {
  return (
    <div
      aria-hidden="true"
      className="absolute overflow-hidden rounded-[26px] bg-white/10 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]"
      style={{ left, top, width, height }}
    >
      <div className="absolute inset-0 animate-skeleton-shimmer bg-[linear-gradient(100deg,transparent_30%,rgb(255_255_255/.22)_50%,transparent_70%)] bg-size-[200%_100%] motion-reduce:animate-none" />
    </div>
  );
}

// The Suspense fallback shown in place of DesktopWidgets while
// sectionsPromise is still pending (scene 1 in
// docs/desktop-home/mockup/loading-states.html): ghost frames at the
// default layout's slots, so the real widgets never jump into a different
// spot once their data resolves. Mirrors the real widgets' own `hidden`
// fade behind an open window.
function DesktopWidgetsSkeleton({ hidden }: { hidden: boolean }) {
  return (
    <div aria-hidden="true" className="absolute inset-0 transition-opacity duration-300" style={{ opacity: hidden ? 0 : 1 }}>
      {DEFAULT_WIDGETS.map(({ kind, column, row }) => {
        const size = widgetSlotSize(WIDGET_SPAN[kind]);
        return (
          <WidgetGhost
            key={kind}
            left={GRID_LEFT + column * (WIDGET_CELL + WIDGET_COLUMN_GAP)}
            top={GRID_TOP + row * (WIDGET_CELL + WIDGET_ROW_GAP)}
            {...size}
          />
        );
      })}
    </div>
  );
}

export { DesktopWidgets, DesktopWidgetsSkeleton };
