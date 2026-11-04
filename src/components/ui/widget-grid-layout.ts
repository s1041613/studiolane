// Pure placement rules for the home-screen-style widget grid. A widget
// covers `span.columns × span.rows` cells starting at (column, row); no two
// widgets may overlap and none may cross the right edge.

export interface GridSpan {
  columns: number;
  rows: number;
}

export interface GridCell {
  column: number;
  row: number;
}

export interface GridPlacement extends GridCell {
  id: string;
  span: GridSpan;
}

function footprintsOverlap(a: GridPlacement, b: GridPlacement): boolean {
  return (
    a.column < b.column + b.span.columns &&
    a.column + a.span.columns > b.column &&
    a.row < b.row + b.span.rows &&
    a.row + a.span.rows > b.row
  );
}

// Whether `moving` fits at `cell` without touching any other placement.
export function isCellFree(
  placements: readonly GridPlacement[],
  moving: Pick<GridPlacement, "id" | "span">,
  cell: GridCell,
  columnCount: number,
): boolean {
  if (cell.column < 0 || cell.row < 0 || cell.column + moving.span.columns > columnCount) return false;
  const candidate = { ...moving, ...cell };
  return placements.every((other) => other.id === moving.id || !footprintsOverlap(candidate, other));
}

// Row-major scan: the first cell where a widget of `span` fits. A grid
// narrower than the widget is treated as exactly as wide, so the scan ends.
export function firstFreeCell(placements: readonly GridPlacement[], span: GridSpan, columnCount: number): GridCell {
  const probe = { id: "", span };
  const columns = Math.max(columnCount, span.columns);
  for (let row = 0; ; row++) {
    for (let column = 0; column + span.columns <= columns; column++) {
      if (isCellFree(placements, probe, { column, row }, columns)) return { column, row };
    }
  }
}

// A drop target that is taken resolves to the closest free cell, searched in
// growing square rings around it, so a drop never displaces another widget.
export function nearestFreeCell(
  placements: readonly GridPlacement[],
  moving: Pick<GridPlacement, "id" | "span">,
  target: GridCell,
  columnCount: number,
): GridCell {
  const clamped = {
    column: Math.min(Math.max(0, target.column), Math.max(0, columnCount - moving.span.columns)),
    row: Math.max(0, target.row),
  };
  if (isCellFree(placements, moving, clamped, columnCount)) return clamped;
  for (let radius = 1; ; radius++) {
    for (let dRow = -radius; dRow <= radius; dRow++) {
      for (let dColumn = -radius; dColumn <= radius; dColumn++) {
        if (Math.max(Math.abs(dRow), Math.abs(dColumn)) !== radius) continue;
        const cell = { column: clamped.column + dColumn, row: clamped.row + dRow };
        if (isCellFree(placements, moving, cell, columnCount)) return cell;
      }
    }
  }
}

// Keeps every placement that still fits where it is, in order, and moves the
// rest (crossing the edge after the grid narrowed, or overlapping an earlier
// one) to the first free cell.
export function fitToColumns(placements: readonly GridPlacement[], columnCount: number): GridPlacement[] {
  return placements.reduce<GridPlacement[]>((placed, placement) => {
    const stays = isCellFree(placed, placement, placement, columnCount);
    return [...placed, stays ? placement : { ...placement, ...firstFreeCell(placed, placement.span, columnCount) }];
  }, []);
}
