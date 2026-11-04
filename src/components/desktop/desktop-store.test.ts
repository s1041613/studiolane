// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { isAnyWindowOpen, useDesktopStore } from "@/components/desktop/desktop-store";
import { DEFAULT_WIDGETS } from "@/components/desktop/widget-kinds";
import { INITIAL_KOBEYEE_SESSION } from "@/components/desktop/kobeyee-session";

const RECT = { x: 10, y: 20, width: 800, height: 600 };

beforeEach(() => {
  useDesktopStore.setState({ windows: {}, widgets: DEFAULT_WIDGETS, editingWidgets: false, kobeyee: INITIAL_KOBEYEE_SESSION });
});

describe("useDesktopStore", () => {
  it("toggleWindow opens a window that doesn't exist yet, at the given rect", () => {
    useDesktopStore.getState().toggleWindow("bookings", RECT);

    const window = useDesktopStore.getState().windows.bookings;
    expect(window).toEqual({ id: "bookings", open: true, rect: RECT });
  });

  it("toggleWindow flips open/closed on a window that already exists", () => {
    useDesktopStore.getState().openWindow("bookings", RECT);

    useDesktopStore.getState().toggleWindow("bookings", RECT);
    expect(useDesktopStore.getState().windows.bookings?.open).toBe(false);

    useDesktopStore.getState().toggleWindow("bookings", RECT);
    expect(useDesktopStore.getState().windows.bookings?.open).toBe(true);
  });

  it("closeWindow on an id that was never opened is a no-op", () => {
    useDesktopStore.getState().closeWindow("bookings");
    expect(useDesktopStore.getState().windows).toEqual({});
  });

  it("setRect updates only the rect, leaving open as-is", () => {
    useDesktopStore.getState().openWindow("bookings", RECT);
    const moved = { x: 50, y: 60, width: 800, height: 600 };

    useDesktopStore.getState().setRect("bookings", moved);

    expect(useDesktopStore.getState().windows.bookings).toEqual({ id: "bookings", open: true, rect: moved });
  });

  it("isAnyWindowOpen reflects any open window, Kobeyee included", () => {
    expect(isAnyWindowOpen(useDesktopStore.getState())).toBe(false);

    useDesktopStore.getState().openWindow("bookings", RECT);
    expect(isAnyWindowOpen(useDesktopStore.getState())).toBe(true);

    useDesktopStore.getState().closeWindow("bookings");
    expect(isAnyWindowOpen(useDesktopStore.getState())).toBe(false);

    useDesktopStore.getState().dispatchKobeyee({ type: "open", layout: "chat", defaultChatRect: RECT });
    expect(isAnyWindowOpen(useDesktopStore.getState())).toBe(true);
  });
});

describe("desktop widgets", () => {
  it("starts with the default left two-column stack", () => {
    expect(useDesktopStore.getState().widgets).toEqual([
      { kind: "today", column: 0, row: 0 },
      { kind: "unpaid", column: 0, row: 2 },
      { kind: "free", column: 1, row: 2 },
    ]);
  });

  it("removeWidget takes the widget off the desktop", () => {
    useDesktopStore.getState().removeWidget("unpaid");

    expect(useDesktopStore.getState().widgets.map((widget) => widget.kind)).toEqual(["today", "free"]);
  });

  it("addWidget puts the widget in the first free cell", () => {
    useDesktopStore.getState().removeWidget("unpaid");

    useDesktopStore.getState().addWidget("unpaid", 4);

    expect(useDesktopStore.getState().widgets.at(-1)).toEqual({ kind: "unpaid", column: 2, row: 0 });
  });

  it("addWidget ignores a widget that is already on the desktop", () => {
    useDesktopStore.getState().addWidget("today", 4);

    expect(useDesktopStore.getState().widgets).toEqual(DEFAULT_WIDGETS);
  });

  it("moveWidget changes only that widget's cell", () => {
    useDesktopStore.getState().moveWidget("free", { column: 3, row: 1 });

    expect(useDesktopStore.getState().widgets).toEqual([
      { kind: "today", column: 0, row: 0 },
      { kind: "unpaid", column: 0, row: 2 },
      { kind: "free", column: 3, row: 1 },
    ]);
  });

  it("persists only the widget layout", () => {
    useDesktopStore.getState().openWindow("bookings", RECT);
    useDesktopStore.getState().moveWidget("free", { column: 3, row: 1 });

    const stored = JSON.parse(localStorage.getItem("studiolane-desktop") ?? "{}");
    expect(Object.keys(stored.state)).toEqual(["widgets"]);
    expect(stored.state.widgets.at(-1)).toEqual({ kind: "free", column: 3, row: 1 });
  });

  it("drops stored widgets of an unknown kind when rehydrating", async () => {
    localStorage.setItem(
      "studiolane-desktop",
      JSON.stringify({
        state: { widgets: [{ kind: "week", column: 0, row: 0 }, { kind: "free", column: 2, row: 0 }] },
        version: 1,
      }),
    );

    await useDesktopStore.persist.rehydrate();

    expect(useDesktopStore.getState().widgets).toEqual([{ kind: "free", column: 2, row: 0 }]);
  });
});
