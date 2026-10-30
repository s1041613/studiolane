// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { NETWORK_FAILURE } from "@/lib/settle";
import { SectionFailure, dataOrEmpty } from "@/components/shared/failures/section-failure";

const dbDown = { kind: "message", code: "UNAVAILABLE", message: "資料庫暫時連不上，請稍後再試一次", errorId: "a1b2c3d4" } as const;

afterEach(cleanup);

describe("SectionFailure", () => {
  it("says 暫時讀不到 (the card's title names what) with the error code underneath", () => {
    render(<SectionFailure failure={dbDown} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("暫時讀不到");
    expect(within(alert).getByText("A1B2C3D4")).toBeInTheDocument();
    expect(alert).not.toHaveTextContent("資料庫");
  });

  it("a card without a title passes its own sentence", () => {
    render(<SectionFailure message="人員名單暫時讀不到" failure={dbDown} />);

    expect(screen.getByRole("alert")).toHaveTextContent("人員名單暫時讀不到");
  });

  it("offers no button besides copying the code", () => {
    render(<SectionFailure failure={dbDown} />);

    expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["複製錯誤代碼"]);
  });

  it("shows no error code when there is none", () => {
    render(<SectionFailure failure={NETWORK_FAILURE} />);

    expect(screen.getByRole("alert")).not.toHaveTextContent("錯誤代碼");
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("dataOrEmpty", () => {
  it("hands a board empty data plus the failure, so it can still draw its toolbar", () => {
    expect(dataOrEmpty({ ok: false, error: dbDown }, [])).toEqual({ data: [], failure: dbDown });
    expect(dataOrEmpty({ ok: true, data: [1] }, [])).toEqual({ data: [1], failure: null });
  });
});
