import { describe, expect, it } from "vitest";
import { makeRental } from "@/server/logic/test-fixtures";
import { RentalStatus } from "@/server/types/home";
import {
  DEFAULT_SHELF_FILTER,
  folderActive,
  rivalText,
  shelfCount,
  shelfRows,
  SHELF_SECTIONS,
  toggleFolder,
  withFolder,
} from "@/server/logic/shelf";
import type { ShelfFilter } from "@/server/logic/shelf";

const TODAY = "2026-11-04"; // a Wednesday

function filter(overrides: Partial<ShelfFilter>): ShelfFilter {
  return { ...DEFAULT_SHELF_FILTER, ...overrides };
}

function entry(sectionTitle: string, label: string) {
  const section = SHELF_SECTIONS.find((s) => s.title === sectionTitle)!;
  return section.items.find((item) => item.label === label)!;
}

describe("shelfRows: 預約 period facet", () => {
  it("今天 shows only today's calendar statuses, newest first", () => {
    const all = [
      makeRental({ id: "today-old", date: TODAY, status: RentalStatus.Pending, createdAt: "2026-01-01T00:00:00Z" }),
      makeRental({ id: "today-new", date: TODAY, status: RentalStatus.Registered, createdAt: "2026-01-02T00:00:00Z" }),
      makeRental({ id: "yesterday", date: "2026-11-03", status: RentalStatus.Registered }),
      makeRental({ id: "today-cancelled", date: TODAY, status: RentalStatus.Cancelled }),
    ];

    const rows = shelfRows(all, filter({ period: "today" }), TODAY);

    expect(rows.map((r) => r.id)).toEqual(["today-new", "today-old"]);
  });

  it("今天 includes a booking that crosses midnight into today", () => {
    const all = [
      makeRental({
        id: "spillover",
        date: "2026-11-03",
        start: "23:30",
        end: "01:00",
        isCrossMidnight: true,
        status: RentalStatus.Registered,
      }),
    ];

    expect(shelfRows(all, filter({ period: "today" }), TODAY).map((r) => r.id)).toEqual(["spillover"]);
  });

  it("本週 shows the Monday–Sunday week containing today, excluding other weeks", () => {
    const all = [
      makeRental({ id: "mon", date: "2026-11-02", status: RentalStatus.Pending }),
      makeRental({ id: "sun", date: "2026-11-08", status: RentalStatus.Registered }),
      makeRental({ id: "next-mon", date: "2026-11-09", status: RentalStatus.Pending }),
      makeRental({ id: "prev-sun", date: "2026-11-01", status: RentalStatus.Pending }),
    ];

    const ids = shelfRows(all, filter({ period: "week" }), TODAY).map((r) => r.id);

    expect(ids).toContain("mon");
    expect(ids).toContain("sun");
    expect(ids).not.toContain("next-mon");
    expect(ids).not.toContain("prev-sun");
  });

  it("本週 excludes postponed/cancelled even within the week", () => {
    const all = [
      makeRental({ id: "postponed", date: TODAY, status: RentalStatus.Postponed }),
      makeRental({ id: "cancelled", date: TODAY, status: RentalStatus.Cancelled }),
    ];

    expect(shelfRows(all, filter({ period: "week" }), TODAY)).toEqual([]);
  });

  it("全部 shows every status, including postponed and cancelled", () => {
    const all = [
      makeRental({ id: "a", date: "2000-01-01", status: RentalStatus.Postponed }),
      makeRental({ id: "b", date: "2099-01-01", status: RentalStatus.Cancelled }),
    ];

    expect(shelfRows(all, filter({ period: "all" }), TODAY).map((r) => r.id).sort()).toEqual(["a", "b"]);
  });
});

describe("shelfRows: 教室 and 狀態 facets alone", () => {
  it("教室 filters by room A or B", () => {
    const all = [
      makeRental({ id: "a", date: TODAY, room: "A" }),
      makeRental({ id: "b", date: TODAY, room: "B" }),
    ];

    expect(shelfRows(all, filter({ room: "A" }), TODAY).map((r) => r.id)).toEqual(["a"]);
    expect(shelfRows(all, filter({ room: "B" }), TODAY).map((r) => r.id)).toEqual(["b"]);
  });

  it("狀態 filters by exact status", () => {
    const all = [
      makeRental({ id: "pending", date: TODAY, status: RentalStatus.Pending }),
      makeRental({ id: "registered", date: TODAY, status: RentalStatus.Registered }),
    ];

    expect(shelfRows(all, filter({ status: RentalStatus.Pending }), TODAY).map((r) => r.id)).toEqual(["pending"]);
  });

  it("puts 撞單 right after 待確認 in the 狀態 section", () => {
    const section = SHELF_SECTIONS.find((s) => s.title === "狀態")!;
    const labels = section.items.map((item) => item.label);
    const pendingIndex = labels.indexOf("待確認");
    expect(labels[pendingIndex + 1]).toBe("撞單");
  });

  it("撞單 shows only rentals with a live conflict, and never a registered rental", () => {
    const clashing = [
      makeRental({ id: "clash-a", date: TODAY, start: "08:00", end: "09:00", room: "A", status: RentalStatus.Pending, createdAt: "2026-01-01T00:00:00Z" }),
      makeRental({ id: "clash-b", date: TODAY, start: "08:30", end: "09:30", room: "A", status: RentalStatus.Pending, createdAt: "2026-01-02T00:00:00Z" }),
      makeRental({ id: "clean", date: TODAY, start: "10:00", end: "11:00", room: "A", status: RentalStatus.Pending }),
    ];
    expect(shelfRows(clashing, filter({ status: "clash" }), TODAY).map((r) => r.id).sort()).toEqual(["clash-a", "clash-b"]);

    const registeredOverlap = [
      makeRental({ id: "r1", date: TODAY, start: "08:00", end: "09:00", room: "A", status: RentalStatus.Registered }),
      makeRental({ id: "r2", date: TODAY, start: "08:30", end: "09:30", room: "A", status: RentalStatus.Registered }),
    ];
    expect(shelfRows(registeredOverlap, filter({ status: "clash" }), TODAY)).toEqual([]);
  });
});

describe("shelfRows: faceted intersection", () => {
  it("本週 + 大教室 + 待確認 shows only rows matching all three", () => {
    const all = [
      makeRental({ id: "match", date: "2026-11-05", room: "A", status: RentalStatus.Pending }),
      makeRental({ id: "wrong-room", date: "2026-11-05", room: "B", status: RentalStatus.Pending }),
      makeRental({ id: "wrong-status", date: "2026-11-05", room: "A", status: RentalStatus.Registered }),
      makeRental({ id: "wrong-week", date: "2026-11-09", room: "A", status: RentalStatus.Pending }),
    ];

    const ids = shelfRows(all, filter({ period: "week", room: "A", status: RentalStatus.Pending }), TODAY).map((r) => r.id);

    expect(ids).toEqual(["match"]);
  });
});

describe("shelfCount: faceted", () => {
  it("matches shelfRows' length for a single facet, and for a combined filter", () => {
    const all = [
      makeRental({ id: "a", date: TODAY, status: RentalStatus.Pending }),
      makeRental({ id: "b", date: "2026-01-01", status: RentalStatus.Registered }),
    ];

    for (const item of SHELF_SECTIONS.flatMap((s) => s.items)) {
      const f = withFolder(DEFAULT_SHELF_FILTER, item);
      expect(shelfCount(all, f, TODAY)).toBe(shelfRows(all, f, TODAY).length);
    }
    const combined = filter({ period: "week", room: "A", status: RentalStatus.Pending });
    expect(shelfCount(all, combined, TODAY)).toBe(shelfRows(all, combined, TODAY).length);
  });

  it("a 狀態 item's count follows the chosen 期間 + 教室, not every rental", () => {
    const all = [
      makeRental({ id: "today-a-pending", date: TODAY, room: "A", status: RentalStatus.Pending }),
      makeRental({ id: "today-b-pending", date: TODAY, room: "B", status: RentalStatus.Pending }),
      makeRental({ id: "other-day-a-pending", date: "2026-01-01", room: "A", status: RentalStatus.Pending }),
    ];
    const pendingEntry = entry("狀態", "待確認");

    const everyone = filter({});
    const todayOnly = filter({ period: "today" });
    const todayRoomA = filter({ period: "today", room: "A" });

    expect(shelfCount(all, withFolder(everyone, pendingEntry), TODAY)).toBe(3);
    expect(shelfCount(all, withFolder(todayOnly, pendingEntry), TODAY)).toBe(2);
    expect(shelfCount(all, withFolder(todayRoomA, pendingEntry), TODAY)).toBe(1);
  });
});

describe("toggleFolder", () => {
  it("period always holds exactly one value: selecting another period replaces it, re-selecting the same one is a no-op", () => {
    const start = filter({ period: "all" });
    const weekEntry = entry("預約", "本週");

    const afterWeek = toggleFolder(start, weekEntry);
    expect(afterWeek.period).toBe("week");

    const afterWeekAgain = toggleFolder(afterWeek, weekEntry);
    expect(afterWeekAgain.period).toBe("week");
  });

  it("clicking an inactive room selects it; clicking the active room clears it back to null", () => {
    const roomA = entry("教室", "大教室");
    const start = filter({});

    const selected = toggleFolder(start, roomA);
    expect(selected.room).toBe("A");
    expect(folderActive(selected, roomA)).toBe(true);

    const cleared = toggleFolder(selected, roomA);
    expect(cleared.room).toBeNull();
    expect(folderActive(cleared, roomA)).toBe(false);
  });

  it("clicking an inactive status selects it; clicking the active status clears it back to null", () => {
    const pendingEntry = entry("狀態", "待確認");
    const start = filter({ room: "B" });

    const selected = toggleFolder(start, pendingEntry);
    expect(selected.status).toBe(RentalStatus.Pending);
    expect(selected.room).toBe("B"); // the other facet is untouched

    const cleared = toggleFolder(selected, pendingEntry);
    expect(cleared.status).toBeNull();
  });

  it("selecting a different status replaces the previous one rather than combining them", () => {
    const pendingEntry = entry("狀態", "待確認");
    const registeredEntry = entry("狀態", "已登記");

    const selected = toggleFolder(filter({ status: RentalStatus.Pending }), registeredEntry);

    expect(selected.status).toBe(RentalStatus.Registered);
    expect(folderActive(selected, pendingEntry)).toBe(false);
  });
});

describe("rivalText", () => {
  it("names the earliest-created overlapping rival", () => {
    const rental = makeRental({
      id: "late",
      date: "2026-11-06",
      start: "15:00",
      end: "16:00",
      room: "A",
      status: RentalStatus.Pending,
      createdAt: "2026-01-03T00:00:00Z",
    });
    const earlyRival = makeRental({
      id: "early",
      person: "某某",
      date: "2026-11-06",
      start: "15:00",
      end: "16:00",
      room: "A",
      status: RentalStatus.Pending,
      createdAt: "2026-01-01T00:00:00Z",
    });
    const laterRival = makeRental({
      id: "later",
      person: "另一人",
      date: "2026-11-06",
      start: "15:00",
      end: "16:00",
      room: "A",
      status: RentalStatus.Pending,
      createdAt: "2026-01-02T00:00:00Z",
    });

    expect(rivalText(rental, [rental, earlyRival, laterRival])).toBe("撞 11/6 15:00 某某");
  });

  it("is empty when the rental has no rival", () => {
    const rental = makeRental({ id: "alone", date: "2026-11-06", status: RentalStatus.Pending });

    expect(rivalText(rental, [rental])).toBe("");
  });
});
