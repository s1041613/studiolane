import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { failBlockers } from "@/lib/result";
import { NETWORK_FAILURE } from "@/lib/settle";
import { ActionFailure } from "@/components/shared/failures/action-failure";

const internal = { kind: "message", code: "INTERNAL", message: "系統發生未預期的錯誤，資料沒有改變", errorId: "c41e09d2" } as const;

const ruleRefusal = {
  ...failBlockers("FAILED_PRECONDITION", "這些課會超出上課時段，請先到課表修改", {
    details: ["11 月 週一 17:30 HIP HOP入門｜嘉茵"],
  }).error,
  errorId: "7f3a2c9b",
};

function positions(html: string, texts: string[]): number[] {
  return texts.map((text) => html.indexOf(text));
}

describe("ActionFailure", () => {
  it("shows the message as an alert strip, with the error code in capitals and a copy button", () => {
    const html = renderToStaticMarkup(<ActionFailure failure={internal} />);

    expect(html).toMatch(/^<div role="alert"/);
    expect(html).toContain("系統發生未預期的錯誤，資料沒有改變");
    expect(html).toContain("錯誤代碼");
    expect(html).toContain(">C41E09D2<");
    expect(html).toContain('aria-label="複製錯誤代碼"');
  });

  it("shows no error code for a failure that never reached the server", () => {
    const html = renderToStaticMarkup(<ActionFailure failure={NETWORK_FAILURE} />);

    expect(html).toContain("連線失敗，請再試一次");
    expect(html).not.toContain("錯誤代碼");
    expect(html).not.toContain("<button");
  });

  it("inline, sits inside a dialog description as spans only, without its own alert", () => {
    const html = renderToStaticMarkup(<ActionFailure variant="inline" failure={{ ...internal, errorId: "0b9d77e1" }} />);

    expect(html).toMatch(/^<span /);
    expect(html).not.toContain('role="alert"');
    expect(html).not.toMatch(/<(div|p)[ >]/);
    expect(html).toContain(">0B9D77E1<");
  });

  it("a blockers failure: the message, its error code, then the blocking classes", () => {
    const html = renderToStaticMarkup(<ActionFailure failure={ruleRefusal} />);

    expect(html).toMatch(/^<div role="alert"/);
    const order = positions(html, ["這些課會超出上課時段", "錯誤代碼", ">7F3A2C9B<", "HIP HOP入門"]);
    expect(order.every((at) => at >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("notice: under a NoticeDialog's description, the code without a copy button, then the lists", () => {
    const html = renderToStaticMarkup(<ActionFailure variant="notice" failure={ruleRefusal} />);

    expect(html).not.toContain("這些課會超出上課時段");
    expect(html).not.toContain("<button");
    const order = positions(html, [">7F3A2C9B<", "HIP HOP入門"]);
    expect(order.every((at) => at >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("notice: renders nothing when there is neither a code nor a list", () => {
    expect(renderToStaticMarkup(<ActionFailure variant="notice" failure={NETWORK_FAILURE} />)).toBe("");
  });
});
