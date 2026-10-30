import { describe, expect, it } from "vitest";
import { purposeRows } from "@/server/logic/purposes";
import { SAMPLE_PURPOSE_SETTINGS } from "@/server/logic/test-fixtures";

const ARCHIVED = "2026-10-13T00:00:00Z";

describe("用途列表", () => {
  it("R01 / T01: 8 列、固定順序、中文名稱，每個身分一格", () => {
    // Fixture order differs from the screen order on purpose.
    const shuffled = [...SAMPLE_PURPOSE_SETTINGS].reverse();
    const rows = purposeRows(shuffled, { showArchived: false });
    expect(rows.map((r) => r.purpose)).toEqual([
      "dance",
      "aerobics",
      "yoga",
      "performance",
      "workshop",
      "private_lesson",
      "front_desk",
      "photography",
    ]);
    expect(rows[0]).toEqual({
      purpose: "dance",
      label: "舞蹈",
      teacher: { text: "方案價格", muted: true },
      staff: { text: "方案價格", muted: true },
      customer: { text: "方案價格", muted: true },
      archivedAt: null,
    });
    expect(rows[3]).toEqual({
      purpose: "performance",
      label: "展演",
      teacher: { text: "0／0", muted: false },
      staff: { text: "不開放", muted: true },
      customer: { text: "不開放", muted: true },
      archivedAt: null,
    });
  });

  it("R01 / T02: 不開放、方案價格是灰字；指定價格是黑字，千分位與全形斜線", () => {
    const settings = SAMPLE_PURPOSE_SETTINGS.map((s) =>
      s.purpose === "dance" ? { ...s, rolePricing: { teacher: { mode: "price" as const, roomA: 1250, roomB: 600 } } } : s,
    );
    const row = purposeRows(settings, { showArchived: false })[0];
    expect(row.teacher).toEqual({ text: "1,250／600", muted: false });
    expect(row.staff).toEqual({ text: "方案價格", muted: true });
  });

  it("R02 / T03: 折扣文字 — 80 → 8 折、85 → 85 折、99 → 99 折", () => {
    const settings = SAMPLE_PURPOSE_SETTINGS.map((s) =>
      s.purpose === "yoga"
        ? {
            ...s,
            rolePricing: {
              teacher: { mode: "discount" as const, payPercent: 80 },
              customer: { mode: "discount" as const, payPercent: 85 },
            },
          }
        : s,
    );
    const row = purposeRows(settings, { showArchived: false }).find((r) => r.purpose === "yoga")!;
    expect(row.teacher).toEqual({ text: "8 折", muted: false });
    expect(row.customer).toEqual({ text: "85 折", muted: false });

    const ninetyNine = SAMPLE_PURPOSE_SETTINGS.map((s) =>
      s.purpose === "yoga" ? { ...s, rolePricing: { teacher: { mode: "discount" as const, payPercent: 99 } } } : s,
    );
    const row99 = purposeRows(ninetyNine, { showArchived: false }).find((r) => r.purpose === "yoga")!;
    expect(row99.teacher).toEqual({ text: "99 折", muted: false });
  });

  it("U01 / U07: 已停用的預設隱藏，勾「顯示已停用」才出現（原位置）", () => {
    const settings = SAMPLE_PURPOSE_SETTINGS.map((s) => (s.purpose === "private_lesson" ? { ...s, archivedAt: ARCHIVED } : s));
    expect(purposeRows(settings, { showArchived: false }).map((r) => r.purpose)).not.toContain("private_lesson");
    const all = purposeRows(settings, { showArchived: true });
    expect(all).toHaveLength(8);
    expect(all[5]).toMatchObject({ purpose: "private_lesson", archivedAt: ARCHIVED });
  });
});
