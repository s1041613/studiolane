// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Window } from "@/components/ui/window";

// motion's useReducedMotion reads prefers-reduced-motion via matchMedia,
// which jsdom doesn't implement.
beforeAll(() => {
  window.matchMedia ??= vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});

afterEach(cleanup);

const RECT = { x: 0, y: 0, width: 800, height: 600 };

describe("Window", () => {
  it("renders nothing when closed", () => {
    render(
      <Window title="預約冊" open={false} rect={RECT} onRectChange={vi.fn()} onClose={vi.fn()}>
        content
      </Window>,
    );

    expect(screen.queryByRole("dialog", { name: "預約冊" })).not.toBeInTheDocument();
  });

  it("shows its title and content when open", () => {
    render(
      <Window title="預約冊" open rect={RECT} onRectChange={vi.fn()} onClose={vi.fn()}>
        預約內容
      </Window>,
    );

    expect(screen.getByRole("dialog", { name: "預約冊" })).toBeInTheDocument();
    expect(screen.getByText("預約內容")).toBeInTheDocument();
  });

  it("closes on Esc", () => {
    const onClose = vi.fn();
    render(
      <Window title="預約冊" open rect={RECT} onRectChange={vi.fn()} onClose={onClose}>
        content
      </Window>,
    );

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when the close light is clicked", () => {
    const onClose = vi.fn();
    render(
      <Window title="預約冊" open rect={RECT} onRectChange={vi.fn()} onClose={onClose}>
        content
      </Window>,
    );

    fireEvent.click(screen.getByRole("button", { name: "關閉視窗" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not react to Esc once closed", () => {
    const onClose = vi.fn();
    render(
      <Window title="預約冊" open={false} rect={RECT} onRectChange={vi.fn()} onClose={onClose}>
        content
      </Window>,
    );

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).not.toHaveBeenCalled();
  });
});
