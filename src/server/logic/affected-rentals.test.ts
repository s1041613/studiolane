import { describe, expect, it } from "vitest";
import { upcomingRentals } from "@/server/logic/affected-rentals";
import { makeRental } from "@/server/logic/test-fixtures";
import { RentalStatus } from "@/server/types/home";

const NOW = new Date("2026-10-13T12:00:00+08:00");

describe("upcomingRentals", () => {
  it("keeps rentals that haven't started yet, soonest first", () => {
    const later = makeRental({ id: "later", date: "2026-10-20", start: "18:00", end: "19:00" });
    const sooner = makeRental({ id: "sooner", date: "2026-10-15", start: "18:00", end: "19:00" });
    const past = makeRental({ id: "past", date: "2026-10-10", start: "18:00", end: "19:00" });
    expect(upcomingRentals([later, past, sooner], NOW).map((r) => r.id)).toEqual(["sooner", "later"]);
  });

  it("drops cancelled and postponed bookings — they no longer hold a slot or owe money", () => {
    const cancelled = makeRental({ id: "c", date: "2026-10-15", status: RentalStatus.Cancelled });
    const postponed = makeRental({ id: "p", date: "2026-10-15", status: RentalStatus.Postponed });
    const registered = makeRental({ id: "r", date: "2026-10-15", status: RentalStatus.Registered });
    expect(upcomingRentals([cancelled, postponed, registered], NOW).map((r) => r.id)).toEqual(["r"]);
  });
});
