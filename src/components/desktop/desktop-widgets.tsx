"use client";

import * as React from "react";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Widget, WidgetAddButton, WidgetEyebrow } from "@/components/ui/widget";
import { WidgetGallery } from "@/components/ui/widget-gallery";
import { WidgetGrid, widgetColumnsForWidth, widgetSlotSize } from "@/components/ui/widget-grid";
import { MENU_BAR_HEIGHT } from "@/components/desktop/menu-bar";
import { useDesktopStore } from "@/components/desktop/desktop-store";
import { WIDGET_KINDS, WIDGET_NAME, WIDGET_SPAN, isWidgetKind } from "@/components/desktop/widget-kinds";
import type { WidgetKind } from "@/components/desktop/widget-kinds";

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

function WidgetBody({ kind }: { kind: WidgetKind }) {
  return <WidgetEyebrow>{WIDGET_NAME[kind]}</WidgetEyebrow>;
}

interface DesktopWidgetsProps {
  hidden: boolean;
}

// The widget layer on the desktop. Right-click opens the edit menu; in edit
// mode widgets wobble, drag between cells and show −, the + opens the
// gallery, and a click on empty desktop (or Esc) ends editing.
function DesktopWidgets({ hidden }: DesktopWidgetsProps) {
  const widgets = useDesktopStore((state) => state.widgets);
  const editing = useDesktopStore((state) => state.editingWidgets);
  const setEditing = useDesktopStore((state) => state.setEditingWidgets);
  const addWidget = useDesktopStore((state) => state.addWidget);
  const removeWidget = useDesktopStore((state) => state.removeWidget);
  const moveWidget = useDesktopStore((state) => state.moveWidget);
  const columnCount = useColumnCount();
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
        <WidgetBody kind={kind} />
      </Widget>
    ),
  }));

  return (
    <ContextMenu>
      <ContextMenuTrigger
        className="absolute inset-0 transition-opacity duration-300"
        style={{ opacity: hidden || !hydrated ? 0 : 1, pointerEvents: hidden ? "none" : undefined }}
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
                <WidgetBody kind={kind} />
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

export { DesktopWidgets };
