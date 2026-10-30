import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WeekTimeline, fitAxis, timelineAxis } from "@/components/shared/schedule/week-timeline";
import type { TimelineDay } from "@/components/shared/schedule/week-timeline";

const DAYS: TimelineDay[] = [
  {
    key: "2026-12-07",
    label: "一 12/7",
    items: [
      { id: "r3", start: "06:00", end: "13:30", label: "平日白天 13:30 前不開放", tone: "muted" },
      { id: "r1", start: "17:30", end: "22:30", label: "營業時段", tone: "muted" },
    ],
  },
  {
    key: "2026-12-13",
    label: "日 12/13",
    items: [
      { id: "r2", start: "13:30", end: "22:30", label: "營業時段", tone: "muted", struck: true },
      { id: "open", start: "13:30", end: "22:30", label: "成發停課，開放租借", tone: "open" },
    ],
  },
];

describe("timelineAxis", () => {
  it("starts at 06:00 unless something starts earlier, ends at 24:00, ticks every 4 hours", () => {
    expect(timelineAxis(DAYS)).toEqual({ from: 360, to: 1440, ticks: [6, 10, 14, 18, 22] });
    const early: TimelineDay[] = [{ key: "x", label: "x", items: [{ id: "a", start: "03:10", end: "04:00", label: "a", tone: "block" }] }];
    expect(timelineAxis(early)).toEqual({ from: 120, to: 1440, ticks: [2, 6, 10, 14, 18, 22] });
  });
});

describe("fitAxis (課表週視圖的範圍)", () => {
  it("runs from the earliest start's hour to the hour after the latest end, ticking hourly", () => {
    const days: TimelineDay[] = [
      { key: "1", label: "一", items: [{ id: "a", start: "17:30", end: "18:30", label: "a", tone: "accent" }] },
      { key: "5", label: "五", items: [{ id: "b", start: "14:00", end: "15:00", label: "b", tone: "accent" }] },
      { key: "6", label: "六", items: [{ id: "c", start: "21:00", end: "22:10", label: "c", tone: "special" }] },
    ];
    expect(fitAxis(days)).toEqual({ from: 840, to: 1380, ticks: [14, 15, 16, 17, 18, 19, 20, 21, 22] });
  });

  it("has no range for an empty week", () => {
    expect(fitAxis([{ key: "1", label: "一", items: [] }])).toBeNull();
  });
});

describe("WeekTimeline", () => {
  it("draws a fitted week 80px an hour", () => {
    const days: TimelineDay[] = [
      { key: "1", label: "一", items: [{ id: "a", start: "17:30", end: "19:40", label: "a", tone: "accent" }] },
    ];
    // 17:00–20:00 is three hours.
    expect(renderToStaticMarkup(<WeekTimeline days={days} fit />)).toContain('style="height:240px"');
  });

  it("draws every item with its label and time, struck items marked", () => {
    const html = renderToStaticMarkup(<WeekTimeline days={DAYS} />);
    expect(html).toContain("一 12/7");
    expect(html).toContain("平日白天 13:30 前不開放");
    expect(html).toContain('title="13:30–22:30 營業時段（這天被蓋掉）"');
    expect(html).toContain('title="13:30–22:30 成發停課，開放租借"');
  });
});
