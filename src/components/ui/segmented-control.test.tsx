import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MultiSegmentedControl, SegmentedControl, singleSelection } from "@/components/ui/segmented-control";

const ROLES = [
  { value: "teacher", label: "老師" },
  { value: "staff", label: "櫃檯" },
  { value: "customer", label: "客戶", disabled: true },
] as const;

describe("singleSelection", () => {
  it("takes the newly pressed option", () => {
    expect(singleSelection(["staff"], "teacher")).toBe("staff");
  });

  // Pressing the current option again would empty the group; keep it chosen.
  it("keeps the current value when the group is emptied", () => {
    expect(singleSelection([], "teacher")).toBe("teacher");
  });
});

describe("SegmentedControl", () => {
  it("renders every option and marks the chosen one pressed", () => {
    const html = renderToStaticMarkup(
      <SegmentedControl aria-label="身分" options={ROLES} value="teacher" onValueChange={() => {}} />,
    );
    expect(html).toContain("老師");
    expect(html).toContain("櫃檯");
    expect(html).toContain("客戶");
    expect(html).toMatch(/aria-pressed="true"[^>]*>老師</);
  });

  // A screen reader announces the field's error when focus reaches the group.
  it("links the group to its error message when invalid", () => {
    const html = renderToStaticMarkup(
      <SegmentedControl
        aria-label="身分"
        aria-invalid
        aria-describedby="role-error"
        options={ROLES}
        value="teacher"
        onValueChange={() => {}}
      />,
    );
    expect(html).toMatch(/role="group"[^>]*aria-invalid="true"|aria-invalid="true"[^>]*role="group"/);
    expect(html).toContain('aria-describedby="role-error"');
  });

  it("adds no error attributes when valid", () => {
    const html = renderToStaticMarkup(
      <SegmentedControl aria-label="身分" options={ROLES} value="teacher" onValueChange={() => {}} />,
    );
    // Class names mention aria-invalid: as a variant, so match attributes only.
    expect(html).not.toMatch(/ aria-invalid="/);
    expect(html).not.toMatch(/ aria-describedby="/);
  });
});

describe("MultiSegmentedControl", () => {
  it("links the group to its error message when invalid", () => {
    const html = renderToStaticMarkup(
      <MultiSegmentedControl
        aria-label="可使用身分"
        aria-invalid
        aria-describedby="roles-error"
        options={ROLES}
        value={[]}
        onValueChange={() => {}}
      />,
    );
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="roles-error"');
  });
});
