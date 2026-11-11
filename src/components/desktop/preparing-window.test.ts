// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { centeredPreparingRect } from "@/components/desktop/preparing-window";

function setViewport(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
}

describe("centeredPreparingRect", () => {
  it("centers a fixed 520x340 box on the viewport", () => {
    setViewport(1280, 800);

    const rect = centeredPreparingRect();

    expect(rect).toEqual({ x: 380, y: 230, width: 520, height: 340 });
  });

  it("stays centered as the viewport changes", () => {
    setViewport(1920, 1080);

    const rect = centeredPreparingRect();

    expect(rect.x + rect.width / 2).toBe(window.innerWidth / 2);
    expect(rect.y + rect.height / 2).toBe(window.innerHeight / 2);
  });
});
