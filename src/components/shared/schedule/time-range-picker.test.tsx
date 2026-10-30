import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TimeRangePicker } from "@/components/shared/schedule/time-range-picker";
import { allDayCandidates } from "@/components/shared/schedule/time-candidates";

describe("TimeRangePicker", () => {
  it("labels both ends, shows the values and ties the error to both", () => {
    const html = renderToStaticMarkup(
      <TimeRangePicker id="rule-time" start="13:30" end="13:00" error="結束要晚於開始" onChange={() => {}} />,
    );
    expect(html).toContain('id="rule-time-start"');
    expect(html).toContain('aria-label="開始"');
    expect(html).toContain('aria-label="結束"');
    expect(html).toContain(">13:30<");
    expect(html).toContain("結束要晚於開始");
    expect(html.match(/aria-describedby="rule-time-error"/g)).toHaveLength(2);
    expect(html).toContain('aria-invalid="true"');
  });

  it("no error, nothing invalid", () => {
    const html = renderToStaticMarkup(<TimeRangePicker id="t" start="" end="" onChange={() => {}} />);
    expect(html).not.toContain("aria-invalid=");
    expect(html).not.toContain("aria-describedby=");
  });
});

describe("allDayCandidates", () => {
  it("lists every half hour from 00:00 through 24:00", () => {
    const all = allDayCandidates();
    expect(all[0]).toBe("00:00");
    expect(all).toContain("13:30");
    expect(all.at(-1)).toBe("24:00");
    expect(all).toHaveLength(49);
  });
});
