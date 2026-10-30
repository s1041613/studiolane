// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConfirmDialog, closeRequest } from "@/components/ui/confirm-dialog";

afterEach(cleanup);

describe("closeRequest", () => {
  // 人員名單 I-05, 價格方案 I-06: Esc / click outside / 取消 on a changed form
  it("asks before throwing away changes", () => {
    expect(closeRequest(true)).toBe("confirm");
  });

  it("closes straight away when nothing changed", () => {
    expect(closeRequest(false)).toBe("close");
  });
});

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("ConfirmDialog", () => {
  it("owns pending: shows a spinner on confirm and resets once the promise settles", async () => {
    const work = deferred();
    const onConfirm = vi.fn(() => work.promise);
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="停用這個方案？"
        confirmLabel="停用"
        onConfirm={onConfirm}
      />,
    );

    const confirmButton = screen.getByRole("button", { name: /停用/ });
    fireEvent.click(confirmButton);
    await waitFor(() => expect(confirmButton).toHaveAttribute("aria-busy", "true"));
    expect(confirmButton).toBeDisabled();
    expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();

    work.resolve();
    await waitFor(() => expect(confirmButton).not.toHaveAttribute("aria-busy"));
    expect(confirmButton).not.toBeDisabled();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("can't be dismissed while onConfirm is still in flight", async () => {
    const work = deferred();
    const onConfirm = vi.fn(() => work.promise);
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="停用這個方案？"
        confirmLabel="停用"
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /停用/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: /停用/ })).toHaveAttribute("aria-busy", "true"));

    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalled();

    work.resolve();
    await waitFor(() => expect(screen.getByRole("button", { name: /停用/ })).not.toHaveAttribute("aria-busy"));
  });
});
