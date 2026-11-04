// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { defaultBookingsRect } from "@/components/desktop/bookings-window";
import { CORNER_RIGHT, CORNER_RESERVE_WIDTH } from "@/components/desktop/kobeyee";

function setViewport(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
}

describe("defaultBookingsRect", () => {
  it("doesn't reach into the idle Kobeyee cat's corner spot", () => {
    setViewport(1280, 720);

    const rect = defaultBookingsRect();
    const cornerLeft = window.innerWidth - CORNER_RIGHT - CORNER_RESERVE_WIDTH;

    expect(rect.x + rect.width).toBeLessThanOrEqual(cornerLeft);
  });

  it("keeps a 6% left margin and fills the width up to the cat's corner", () => {
    setViewport(1920, 1080);

    const rect = defaultBookingsRect();
    const cornerLeft = window.innerWidth - CORNER_RIGHT - CORNER_RESERVE_WIDTH;

    expect(rect.x).toBe(Math.round(1920 * 0.06));
    expect(rect.x + rect.width).toBe(Math.min(1920 - rect.x, cornerLeft));
  });
});
