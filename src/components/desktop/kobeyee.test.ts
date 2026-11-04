// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { KOBEYEE_TOP_INSET, defaultKobeyeeRect, perchPosition } from "@/components/desktop/kobeyee";
import { MENU_BAR_HEIGHT } from "@/components/desktop/menu-bar";

function setViewport(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
}

describe("defaultKobeyeeRect", () => {
  it("stays inside the viewport and clears the menu bar", () => {
    setViewport(1280, 800);

    const rect = defaultKobeyeeRect();

    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(1280);
    expect(rect.y).toBeGreaterThanOrEqual(MENU_BAR_HEIGHT);
    expect(rect.y + rect.height).toBeLessThanOrEqual(800);
  });

  it("is anchored to the bottom-right corner", () => {
    setViewport(1280, 800);

    const rect = defaultKobeyeeRect();
    const margin = 1280 - (rect.x + rect.width);

    // Same margin reserved on the right as between the window's bottom and
    // the viewport's bottom (the window sits just above the Dock).
    expect(margin).toBeGreaterThan(0);
    expect(margin).toBeLessThan(40);
    expect(800 - (rect.y + rect.height)).toBeGreaterThan(0);
  });

  it("shrinks to fit a short viewport without going off-screen", () => {
    // Short enough to force shrinking below KOBEYEE_DEFAULT_HEIGHT, but still
    // tall enough for KOBEYEE_MIN_HEIGHT plus the perch's clearance above the
    // menu bar (KOBEYEE_TOP_INSET) to both fit. Below that floor, the window
    // can't satisfy both, and fixing that needs a redesign of
    // KOBEYEE_MIN_HEIGHT, which is out of scope here.
    setViewport(1280, 650);

    const rect = defaultKobeyeeRect();

    expect(rect.y).toBeGreaterThanOrEqual(KOBEYEE_TOP_INSET);
    expect(rect.y + rect.height).toBeLessThanOrEqual(650);
    expect(rect.height).toBeLessThan(560);
  });
});

describe("perchPosition", () => {
  const rect = { x: 760, y: 104, width: 440, height: 560 };

  it("sits on the window's top edge, right side", () => {
    const box = perchPosition(rect);

    // The cat's feet land close to the window's top edge, not far above or
    // deep inside it.
    expect(box.top + box.height).toBeGreaterThan(rect.y - 5);
    expect(box.top + box.height).toBeLessThan(rect.y + 20);
    // Horizontally, its center sits in the window's right half.
    expect(box.left + box.width / 2).toBeGreaterThan(rect.x + rect.width / 2);
    expect(box.left + box.width).toBeLessThanOrEqual(rect.x + rect.width + box.width);
  });

  it("follows the window: moving the rect moves the cat by the same delta", () => {
    const before = perchPosition(rect);
    const moved = { ...rect, x: rect.x + 120, y: rect.y + 48 };

    const after = perchPosition(moved);

    expect(after.left - before.left).toBe(120);
    expect(after.top - before.top).toBe(48);
  });

  it("keeps the cat's head below the menu bar at the default rect", () => {
    setViewport(1280, 800);

    const box = perchPosition(defaultKobeyeeRect());

    expect(box.top).toBeGreaterThanOrEqual(MENU_BAR_HEIGHT);
  });

  it("keeps the cat's head below the menu bar at the window's top drag limit", () => {
    // KOBEYEE_TOP_INSET is the Window component's `topInset`, the highest
    // `y` a drag can ever commit (src/components/ui/window.tsx clamps to
    // it). The perch has to clear the menu bar even there, not just at the
    // default rect.
    const atTopLimit = { ...rect, y: KOBEYEE_TOP_INSET };

    const box = perchPosition(atTopLimit);

    expect(box.top).toBeGreaterThanOrEqual(MENU_BAR_HEIGHT);
  });
});
