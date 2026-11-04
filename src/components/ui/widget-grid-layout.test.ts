import { describe, expect, it } from "vitest";
import { firstFreeCell, fitToColumns, isCellFree, nearestFreeCell } from "@/components/ui/widget-grid-layout";
import type { GridPlacement } from "@/components/ui/widget-grid-layout";

const LARGE = { columns: 2, rows: 2 };
const SMALL = { columns: 1, rows: 1 };

// The default desktop: one 2×2 widget with two 1×1 widgets under it.
const DEFAULT_STACK: GridPlacement[] = [
  { id: "today", span: LARGE, column: 0, row: 0 },
  { id: "unpaid", span: SMALL, column: 0, row: 2 },
  { id: "free", span: SMALL, column: 1, row: 2 },
];

describe("isCellFree", () => {
  it("rejects a cell covered by another widget's footprint", () => {
    expect(isCellFree(DEFAULT_STACK, { id: "x", span: SMALL }, { column: 1, row: 1 }, 4)).toBe(false);
  });

  it("ignores the moving widget's own footprint", () => {
    expect(isCellFree(DEFAULT_STACK, { id: "today", span: LARGE }, { column: 0, row: 0 }, 4)).toBe(true);
  });

  it("rejects a cell that would push the widget past the right edge", () => {
    expect(isCellFree([], { id: "x", span: LARGE }, { column: 3, row: 0 }, 4)).toBe(false);
  });
});

describe("firstFreeCell", () => {
  it("scans row by row from the top-left", () => {
    expect(firstFreeCell(DEFAULT_STACK, SMALL, 4)).toEqual({ column: 2, row: 0 });
  });

  it("goes below everything when no row has room", () => {
    expect(firstFreeCell(DEFAULT_STACK, LARGE, 2)).toEqual({ column: 0, row: 3 });
  });

  it("still ends when the grid is narrower than the widget", () => {
    expect(firstFreeCell([], LARGE, 1)).toEqual({ column: 0, row: 0 });
  });
});

describe("nearestFreeCell", () => {
  it("keeps a free target as is", () => {
    expect(nearestFreeCell(DEFAULT_STACK, { id: "unpaid", span: SMALL }, { column: 3, row: 1 }, 4)).toEqual({
      column: 3,
      row: 1,
    });
  });

  it("moves a taken target to the closest free cell instead of displacing the other widget", () => {
    const cell = nearestFreeCell(DEFAULT_STACK, { id: "unpaid", span: SMALL }, { column: 1, row: 1 }, 4);
    expect(cell).toEqual({ column: 2, row: 0 });
  });

  it("clamps a target past the edges back into the grid", () => {
    expect(nearestFreeCell([], { id: "x", span: LARGE }, { column: 9, row: -3 }, 4)).toEqual({ column: 2, row: 0 });
  });
});

describe("fitToColumns", () => {
  it("leaves a layout that already fits untouched", () => {
    expect(fitToColumns(DEFAULT_STACK, 4)).toEqual(DEFAULT_STACK);
  });

  it("moves a widget that crosses the edge after the grid narrows", () => {
    const wide: GridPlacement[] = [
      { id: "today", span: LARGE, column: 0, row: 0 },
      { id: "free", span: SMALL, column: 3, row: 0 },
    ];
    expect(fitToColumns(wide, 2)).toEqual([
      { id: "today", span: LARGE, column: 0, row: 0 },
      { id: "free", span: SMALL, column: 0, row: 2 },
    ]);
  });

  it("resolves an overlap in favour of the earlier widget", () => {
    const clashing: GridPlacement[] = [
      { id: "a", span: SMALL, column: 0, row: 0 },
      { id: "b", span: SMALL, column: 0, row: 0 },
    ];
    expect(fitToColumns(clashing, 2)).toEqual([
      { id: "a", span: SMALL, column: 0, row: 0 },
      { id: "b", span: SMALL, column: 1, row: 0 },
    ]);
  });
});
