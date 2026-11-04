// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { isAnyWindowOpen, useDesktopStore } from "@/components/desktop/desktop-store";

const RECT = { x: 10, y: 20, width: 800, height: 600 };

beforeEach(() => {
  useDesktopStore.setState({ windows: {} });
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

  it("isAnyWindowOpen reflects whether any window in the record is open", () => {
    expect(isAnyWindowOpen({})).toBe(false);

    useDesktopStore.getState().openWindow("bookings", RECT);
    expect(isAnyWindowOpen(useDesktopStore.getState().windows)).toBe(true);

    useDesktopStore.getState().closeWindow("bookings");
    expect(isAnyWindowOpen(useDesktopStore.getState().windows)).toBe(false);
  });
});
