"use client";

import * as React from "react";
import { animate, motion, useDragControls, useMotionValue, useReducedMotion } from "motion/react";
import { fitToColumns, nearestFreeCell } from "@/components/ui/widget-grid-layout";
import type { GridCell, GridPlacement, GridSpan } from "@/components/ui/widget-grid-layout";

// Cell geometry, in pixels: square cells, a wider gap between columns than
// between rows.
export const WIDGET_CELL = 158;
export const WIDGET_COLUMN_GAP = 26;
export const WIDGET_ROW_GAP = 8;

const COLUMN_PITCH = WIDGET_CELL + WIDGET_COLUMN_GAP;
const ROW_PITCH = WIDGET_CELL + WIDGET_ROW_GAP;

// How many whole columns fit in `width`. Never fewer than two, so the
// default 2×2 widget always fits.
export function widgetColumnsForWidth(width: number): number {
  return Math.max(2, Math.floor((width + WIDGET_COLUMN_GAP) / COLUMN_PITCH));
}

// The pixel box a widget of `span` occupies, gaps between its cells included.
export function widgetSlotSize(span: GridSpan): { width: number; height: number } {
  return {
    width: span.columns * COLUMN_PITCH - WIDGET_COLUMN_GAP,
    height: span.rows * ROW_PITCH - WIDGET_ROW_GAP,
  };
}

function cellOrigin({ column, row }: GridCell): { x: number; y: number } {
  return { x: column * COLUMN_PITCH, y: row * ROW_PITCH };
}

function cellAt(x: number, y: number): GridCell {
  return { column: Math.round(x / COLUMN_PITCH), row: Math.round(y / ROW_PITCH) };
}

const SETTLE = { type: "spring", stiffness: 420, damping: 36 } as const;

export interface WidgetGridItem extends GridPlacement {
  content: React.ReactNode;
}

interface WidgetGridProps {
  items: readonly WidgetGridItem[];
  columnCount: number;
  editing: boolean;
  onMove: (id: string, cell: GridCell) => void;
}

// Lays widgets out on a home-screen-style grid. In edit mode a widget can be
// dragged; on release it snaps to the cell under it, or the nearest free one
// if that cell is taken, so a drop never displaces another widget. Saved
// cells that no longer fit the current width are shown re-flowed without
// rewriting what was saved.
function WidgetGrid({ items, columnCount, editing, onMove }: WidgetGridProps) {
  const placed = fitToColumns(items, columnCount);
  const contentById = new Map(items.map((item) => [item.id, item.content]));
  const rowCount = Math.max(0, ...placed.map((item) => item.row + item.span.rows));

  return (
    <div
      role="group"
      className="relative"
      style={{
        width: columnCount * COLUMN_PITCH - WIDGET_COLUMN_GAP,
        height: Math.max(0, rowCount * ROW_PITCH - WIDGET_ROW_GAP),
      }}
    >
      {placed.map((placement) => (
        <WidgetGridCell
          key={placement.id}
          placement={placement}
          placements={placed}
          columnCount={columnCount}
          editing={editing}
          onMove={onMove}
        >
          {contentById.get(placement.id)}
        </WidgetGridCell>
      ))}
    </div>
  );
}

interface WidgetGridCellProps {
  placement: GridPlacement;
  placements: readonly GridPlacement[];
  columnCount: number;
  editing: boolean;
  onMove: (id: string, cell: GridCell) => void;
  children: React.ReactNode;
}

// One widget's slot. Its position lives in two motion values rather than in
// left/top, so the same values carry a drag, the settle after a drop, and a
// re-flow after the grid narrows.
function WidgetGridCell({ placement, placements, columnCount, editing, onMove, children }: WidgetGridCellProps) {
  const origin = cellOrigin(placement);
  const x = useMotionValue(origin.x);
  const y = useMotionValue(origin.y);
  const [dragging, setDragging] = React.useState(false);
  const dragControls = useDragControls();
  const reduceMotion = useReducedMotion();

  const settleTo = React.useCallback(
    (target: { x: number; y: number }) => {
      if (reduceMotion) {
        x.set(target.x);
        y.set(target.y);
        return;
      }
      animate(x, target.x, SETTLE);
      animate(y, target.y, SETTLE);
    },
    [reduceMotion, x, y],
  );

  React.useEffect(() => {
    if (!dragging) settleTo({ x: origin.x, y: origin.y });
  }, [dragging, origin.x, origin.y, settleTo]);

  function handleDragEnd() {
    const cell = nearestFreeCell(placements, placement, cellAt(x.get(), y.get()), columnCount);
    setDragging(false);
    onMove(placement.id, cell);
    settleTo(cellOrigin(cell));
  }

  return (
    <motion.div
      className="absolute top-0 left-0"
      style={{
        x,
        y,
        ...widgetSlotSize(placement.span),
        zIndex: dragging ? 20 : 1,
        cursor: editing ? (dragging ? "grabbing" : "grab") : undefined,
        touchAction: editing ? "none" : undefined,
      }}
      drag={editing}
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      onPointerDown={(event) => {
        if (editing) dragControls.start(event);
      }}
      onDragStart={() => setDragging(true)}
      onDragEnd={handleDragEnd}
      animate={{ scale: dragging ? 1.05 : 1 }}
      transition={{ duration: 0.15 }}
      data-widget-id={placement.id}
    >
      {children}
    </motion.div>
  );
}

export { WidgetGrid };
