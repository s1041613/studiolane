import { describe, expect, it } from "vitest";
import { makeRental } from "@/server/logic/test-fixtures";
import { RentalStatus } from "@/server/types/home";
import { rivalText, shelfCount, shelfRows, SHELF_SECTIONS } from "@/server/logic/shelf";

const TODAY = "2026-11-04"; // a Wednesday

describe("shelfRows: 預約 period folders", () => {
  it("今天 shows only today's calendar statuses, newest first", () => {
    const all = [
      makeRental({ id: "today-old", date: TODAY, status: RentalStatus.Pending, createdAt: "2026-01-01T00:00:00Z" }),
      makeRental({ id: "today-new", date: TODAY, status: RentalStatus.Registered, createdAt: "2026-01-02T00:00:00Z" }),
      makeRental({ id: "yesterday", date: "2026-11-03", status: RentalStatus.Registered }),
      makeRental({ id: "today-cancelled", date: TODAY, status: RentalStatus.Cancelled }),
    ];

    const rows = shelfRows(all, { kind: "period", period: "today" }, TODAY);

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

    expect(shelfRows(all, { kind: "period", period: "today" }, TODAY).map((r) => r.id)).toEqual(["spillover"]);
  });

  it("本週 shows the Monday–Sunday week containing today, excluding other weeks", () => {
    const all = [
      makeRental({ id: "mon", date: "2026-11-02", status: RentalStatus.Pending }),
      makeRental({ id: "sun", date: "2026-11-08", status: RentalStatus.Registered }),
      makeRental({ id: "next-mon", date: "2026-11-09", status: RentalStatus.Pending }),
      makeRental({ id: "prev-sun", date: "2026-11-01", status: RentalStatus.Pending }),
    ];

    const ids = shelfRows(all, { kind: "period", period: "week" }, TODAY).map((r) => r.id);

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

    expect(shelfRows(all, { kind: "period", period: "week" }, TODAY)).toEqual([]);
  });

  it("全部 shows every status, including postponed and cancelled", () => {
    const all = [
      makeRental({ id: "a", date: "2000-01-01", status: RentalStatus.Postponed }),
      makeRental({ id: "b", date: "2099-01-01", status: RentalStatus.Cancelled }),
    ];

    expect(shelfRows(all, { kind: "period", period: "all" }, TODAY).map((r) => r.id).sort()).toEqual(["a", "b"]);
  });
});

describe("shelfRows: 教室 folders", () => {
  it("filters by room A or B", () => {
    const all = [
      makeRental({ id: "a", date: TODAY, room: "A" }),
      makeRental({ id: "b", date: TODAY, room: "B" }),
    ];

    expect(shelfRows(all, { kind: "room", room: "A" }, TODAY).map((r) => r.id)).toEqual(["a"]);
    expect(shelfRows(all, { kind: "room", room: "B" }, TODAY).map((r) => r.id)).toEqual(["b"]);
  });
});

describe("shelfRows: 狀態 folders", () => {
  it("filters by exact status", () => {
    const all = [
      makeRental({ id: "pending", date: TODAY, status: RentalStatus.Pending }),
      makeRental({ id: "registered", date: TODAY, status: RentalStatus.Registered }),
    ];

    expect(shelfRows(all, { kind: "status", status: RentalStatus.Pending }, TODAY).map((r) => r.id)).toEqual([
      "pending",
    ]);
  });

  it("puts 撞單 right after 待確認 in the 狀態 section", () => {
    const section = SHELF_SECTIONS.find((s) => s.title === "狀態")!;
    const labels = section.items.map((item) => item.label);
    const pendingIndex = labels.indexOf("待確認");
    expect(labels[pendingIndex + 1]).toBe("撞單");
  });
});

describe("shelfRows: 撞單 folder", () => {
  it("shows only rentals with a live conflict", () => {
    const all = [
      makeRental({
        id: "clash-a",
        date: TODAY,
        start: "08:00",
        end: "09:00",
        room: "A",
        status: RentalStatus.Pending,
        createdAt: "2026-01-01T00:00:00Z",
      }),
      makeRental({
        id: "clash-b",
        date: TODAY,
        start: "08:30",
        end: "09:30",
        room: "A",
        status: RentalStatus.Pending,
        createdAt: "2026-01-02T00:00:00Z",
      }),
      makeRental({ id: "clean", date: TODAY, start: "10:00", end: "11:00", room: "A", status: RentalStatus.Pending }),
    ];

    expect(shelfRows(all, { kind: "clash" }, TODAY).map((r) => r.id).sort()).toEqual(["clash-a", "clash-b"]);
  });

  it("never flags a registered rental as clashing", () => {
    const all = [
      makeRental({ id: "r1", date: TODAY, start: "08:00", end: "09:00", room: "A", status: RentalStatus.Registered }),
      makeRental({ id: "r2", date: TODAY, start: "08:30", end: "09:30", room: "A", status: RentalStatus.Registered }),
    ];

    expect(shelfRows(all, { kind: "clash" }, TODAY)).toEqual([]);
  });
});

describe("shelfCount", () => {
  it("matches shelfRows' length for the same folder", () => {
    const all = [
      makeRental({ id: "a", date: TODAY, status: RentalStatus.Pending }),
      makeRental({ id: "b", date: "2026-01-01", status: RentalStatus.Registered }),
    ];

    for (const folder of SHELF_SECTIONS.flatMap((s) => s.items.map((i) => i.folder))) {
      expect(shelfCount(all, folder, TODAY)).toBe(shelfRows(all, folder, TODAY).length);
    }
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
