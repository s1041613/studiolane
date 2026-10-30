// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ActionButton } from "@/components/ui/action-button";

// Records how every click-guard run settles, so a test can see a rejection
// leave ActionButton without leaving it unhandled in the worker.
const guardRuns = vi.hoisted(() => [] as Promise<PromiseSettledResult<unknown>>[]);

vi.mock("@/lib/click-guard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/click-guard")>();
  return {
    ...actual,
    createClickGuard: (...args: Parameters<typeof actual.createClickGuard>) => {
      const guard = actual.createClickGuard(...args);
      return {
        ...guard,
        run: <T,>(task: () => T | Promise<T>) => {
          const result = guard.run(task);
          guardRuns.push(Promise.allSettled([result]).then(([settled]) => settled));
          return result;
        },
      };
    },
  };
});

afterEach(() => {
  cleanup();
  guardRuns.length = 0;
});

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("ActionButton onClick mode", () => {
  it("sets pending on click and resets it once the promise resolves", async () => {
    const work = deferred();
    const onClick = vi.fn(() => work.promise);
    render(<ActionButton onClick={onClick}>儲存</ActionButton>);

    const button = screen.getByRole("button", { name: /儲存/ });
    expect(button).not.toHaveAttribute("aria-busy");

    fireEvent.click(button);
    await waitFor(() => expect(button).toHaveAttribute("aria-busy", "true"));
    expect(button).toBeDisabled();

    work.resolve();
    await waitFor(() => expect(button).not.toHaveAttribute("aria-busy"));
    expect(button).not.toBeDisabled();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("BTN-1/2: ignores a second click while the first is still in flight", async () => {
    const work = deferred();
    const onClick = vi.fn(() => work.promise);
    render(<ActionButton onClick={onClick}>儲存</ActionButton>);

    const button = screen.getByRole("button", { name: /儲存/ });
    fireEvent.click(button);
    await waitFor(() => expect(button).toHaveAttribute("aria-busy", "true"));
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);

    work.resolve();
    await waitFor(() => expect(button).not.toHaveAttribute("aria-busy"));
  });

  it("never catches: a rejection still surfaces, and pending resets anyway", async () => {
    const error = new Error("NEXT_REDIRECT");
    const onClick = vi.fn(() => Promise.reject(error));

    render(<ActionButton onClick={onClick}>儲存</ActionButton>);
    const button = screen.getByRole("button", { name: /儲存/ });
    fireEvent.click(button);

    // The click handler is fire-and-forget (`void guard.run(...)`), exactly
    // like the real redirect() case the prototype verified: the rejection
    // must keep propagating, not get swallowed by ActionButton.
    expect(guardRuns).toHaveLength(1);
    await expect(guardRuns[0]).resolves.toEqual({ status: "rejected", reason: error });
    await waitFor(() => expect(button).not.toHaveAttribute("aria-busy"));
    expect(button).not.toBeDisabled();
  });
});

describe("ActionButton external pending mode", () => {
  it("mirrors the given pending flag without owning a click guard", () => {
    const { rerender } = render(
      <ActionButton type="submit" pending={false}>
        登入
      </ActionButton>,
    );
    const button = screen.getByRole("button", { name: /登入/ });
    expect(button).not.toBeDisabled();
    expect(button).not.toHaveAttribute("aria-busy");

    rerender(
      <ActionButton type="submit" pending={true}>
        登入
      </ActionButton>,
    );
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });

  it("does not type-check with both onClick and pending (mutually exclusive)", () => {
    // @ts-expect-error — onClick and pending can't both be passed.
    const element = <ActionButton onClick={async () => undefined} pending={false} />;
    void element;
  });
});
