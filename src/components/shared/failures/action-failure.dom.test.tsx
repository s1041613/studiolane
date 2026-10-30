// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ActionFailure } from "@/components/shared/failures/action-failure";

const internal = { kind: "message", code: "INTERNAL", message: "系統發生未預期的錯誤，資料沒有改變", errorId: "c41e09d2" } as const;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ActionFailure in the browser", () => {
  it("copies the error code and announces it in the status region, which is silent until then", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    render(<ActionFailure failure={internal} />);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(/^$/);

    fireEvent.click(screen.getByRole("button", { name: "複製錯誤代碼" }));

    expect(await screen.findByText("已複製錯誤代碼")).toBe(status);
    expect(writeText).toHaveBeenCalledWith("C41E09D2");
  });
});
