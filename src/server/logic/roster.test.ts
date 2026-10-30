import { describe, expect, it } from "vitest";
import {
  bookableRenters,
  isValidInstagram,
  namesakeHint,
  normalizeInstagram,
  rentableRoster,
} from "@/server/logic/roster";
import { roleToLabel } from "@/server/supabase/codecs";
import { STAFF, TEACHER } from "@/server/logic/test-fixtures";
import type { RosterEntry } from "@/server/logic/pricing";

const UU: RosterEntry = {
  id: "guest-uu",
  name: "uu",
  email: "",
  phone: "",
  role: "guest_teacher",
  pricingPlanId: "plan-customer",
  instagram: "__demo1",
  archivedAt: null,
};

const ARCHIVED_TEACHER: RosterEntry = { ...TEACHER, id: "teacher-archived", name: "示範小鹿", archivedAt: "2026-10-01T00:00:00Z" };

describe("bookableRenters", () => {
  // T61 / Q-T5: guest teachers only cover other teachers' classes
  it("T61: drops guest teachers from the booking renter list", () => {
    expect(bookableRenters([TEACHER, STAFF, UU])).toEqual([TEACHER, STAFF]);
  });

  // Roster R21 / T26: archived people can't be picked as renters
  it("T26: drops archived people from the booking renter list", () => {
    expect(bookableRenters([TEACHER, ARCHIVED_TEACHER, STAFF])).toEqual([TEACHER, STAFF]);
  });
});

describe("rentableRoster", () => {
  // The server re-check keeps archived renters so it can say why they fail.
  it("drops guest teachers but keeps archived people", () => {
    expect(rentableRoster([TEACHER, ARCHIVED_TEACHER, UU])).toEqual([TEACHER, ARCHIVED_TEACHER]);
  });
});

describe("roleToLabel", () => {
  it("labels guest teachers as 外部老師", () => {
    expect(roleToLabel("guest_teacher")).toBe("外部老師");
  });

  it("SH16 / T17: labels staff as 櫃檯", () => {
    expect(roleToLabel("staff")).toBe("櫃檯");
  });
});

describe("namesakeHint", () => {
  const coffee: RosterEntry = { ...TEACHER, id: "coffee-1", name: "咖啡", instagram: "demo.coffee" };
  const coffeeNoIg: RosterEntry = { ...TEACHER, id: "coffee-2", name: " 咖啡 ", instagram: "" };

  it("is empty when nobody else in the list shares the name", () => {
    expect(namesakeHint(coffee, [coffee, UU])).toBe("");
  });

  it("tells namesakes apart by IG handle, falling back to the role label", () => {
    const people = [coffee, coffeeNoIg];
    expect(namesakeHint(coffee, people)).toBe("@demo.coffee");
    expect(namesakeHint(coffeeNoIg, people)).toBe(roleToLabel(TEACHER.role));
  });

  it("matches namesakes case-insensitively", () => {
    const upper: RosterEntry = { ...UU, id: "guest-uu-2", name: "UU", instagram: "" };
    expect(namesakeHint(UU, [UU, upper])).toBe("@__demo1");
    expect(namesakeHint(upper, [UU, upper])).toBe("外部老師");
  });
});

describe("normalizeInstagram", () => {
  it.each(["@demo_dancer", "https://instagram.com/demo_dancer/", "https://www.instagram.com/demo_dancer?igsh=x", " demo_dancer "])( // gitleaks:allow
    "S-19 / T15: %s becomes the bare handle",
    (raw) => {
      expect(normalizeInstagram(raw)).toBe("demo_dancer");
    },
  );
});

describe("isValidInstagram", () => {
  it("S-19 / B10 / T16: only letters, digits, . and _, up to 30 characters", () => {
    expect(isValidInstagram("demo dancer")).toBe(false);
    expect(isValidInstagram("舞者")).toBe(false);
    expect(isValidInstagram("a".repeat(31))).toBe(false);
    expect(isValidInstagram("__demo1")).toBe(true);
  });
});
