import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StatusBadge, archivedRowClass } from "@/components/ui/status-badge";

const ARCHIVED_AT = "2026-10-01T00:00:00Z";

describe("StatusBadge", () => {
  it("SH10 / T10: shows 已停用 and fades the row when archived", () => {
    expect(renderToStaticMarkup(<StatusBadge archivedAt={ARCHIVED_AT} />)).toContain("已停用");
    expect(archivedRowClass(ARCHIVED_AT)).not.toBe("");
  });

  it("SH11 / T11: renders nothing and leaves the row alone while in use", () => {
    expect(renderToStaticMarkup(<StatusBadge archivedAt={null} />)).toBe("");
    expect(archivedRowClass(null)).toBe("");
  });

  it("SH12 / T12: uses the label the page passes in", () => {
    const html = renderToStaticMarkup(<StatusBadge archivedAt={ARCHIVED_AT} label="暫不開放" />);
    expect(html).toContain("暫不開放");
    expect(html).not.toContain("已停用");
  });
});
