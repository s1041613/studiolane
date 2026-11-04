import type { GridCell, GridPlacement, GridSpan } from "@/components/ui/widget-grid-layout";

// The desktop's widgets. Each kind appears at most once, so the kind doubles
// as the widget's id, and each has one fixed size.
export const WIDGET_KINDS = ["today", "unpaid", "free"] as const;
export type WidgetKind = (typeof WIDGET_KINDS)[number];

export const WIDGET_SPAN: Record<WidgetKind, GridSpan> = {
  today: { columns: 2, rows: 2 },
  unpaid: { columns: 1, rows: 1 },
  free: { columns: 1, rows: 1 },
};

export const WIDGET_NAME: Record<WidgetKind, string> = {
  today: "今日教室",
  unpaid: "待付款",
  free: "下一個空檔",
};

export interface WidgetPlacement extends GridCell {
  kind: WidgetKind;
}

// Default layout: a left two-column stack, 今日教室 on top.
export const DEFAULT_WIDGETS: WidgetPlacement[] = [
  { kind: "today", column: 0, row: 0 },
  { kind: "unpaid", column: 0, row: 2 },
  { kind: "free", column: 1, row: 2 },
];

export function toGridPlacements(widgets: readonly WidgetPlacement[]): GridPlacement[] {
  return widgets.map(({ kind, column, row }) => ({ id: kind, span: WIDGET_SPAN[kind], column, row }));
}

export function isWidgetKind(value: unknown): value is WidgetKind {
  return WIDGET_KINDS.some((kind) => kind === value);
}
