import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RowAction } from "@/components/ui/row-action";

function attrs(html: string): Record<string, string> {
  const tag = html.match(/<button[^>]*>/)?.[0] ?? "";
  return Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
}

describe("RowAction", () => {
  it("names the action and the row for screen readers, and the action on hover", () => {
    const button = attrs(renderToStaticMarkup(<RowAction action="edit" target="Amber" />));
    expect(button["aria-label"]).toBe("編輯 Amber");
    expect(button.title).toBe("編輯");
    expect(button["aria-disabled"]).toBeUndefined();
  });

  it("uses 啟用 for reactivate and 停用 for archive", () => {
    expect(attrs(renderToStaticMarkup(<RowAction action="reactivate" target="老師價" />))["aria-label"]).toBe("啟用 老師價");
    expect(attrs(renderToStaticMarkup(<RowAction action="archive" target="老師價" />))["aria-label"]).toBe("停用 老師價");
  });

  it("stays in place when unavailable: aria-disabled, the reason on hover", () => {
    const button = attrs(
      renderToStaticMarkup(<RowAction action="archive" target="一般價" disabledReason="預設方案不能停用" />),
    );
    expect(button["aria-disabled"]).toBe("true");
    expect(button.title).toBe("預設方案不能停用");
    // Still focusable and hoverable, so the reason can be read.
    expect(button.disabled).toBeUndefined();
  });
});
