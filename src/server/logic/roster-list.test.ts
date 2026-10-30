import { describe, expect, it } from "vitest";
import { filterRoster, sortRoster } from "@/server/logic/roster-list";
import type { RosterQuery } from "@/server/logic/roster-list";
import type { RosterEntry } from "@/server/logic/pricing";
import { roleToLabel } from "@/server/supabase/codecs";

function person(name: string, role: RosterEntry["role"], extra: Partial<RosterEntry> = {}): RosterEntry {
  return {
    id: `${role}-${name}`,
    name,
    email: "",
    phone: "",
    role,
    pricingPlanId: `plan-${role}`,
    instagram: "",
    archivedAt: null,
    ...extra,
  };
}

const XIAOYU = person("示範小雨", "teacher", { phone: "0912345678", instagram: "demo_xiaoyu" });
const XIAOJU = person("示範小橘", "teacher");
const XIAOLU = person("示範小鹿", "teacher", { archivedAt: "2026-10-01T00:00:00Z" });
const KIKI = person("demo_kiki", "staff");
const ZHOU = person("示範周", "staff");
const ASHAN = person("示範阿山", "staff");
const MINT = person("示範薄荷", "guest_teacher", { instagram: "demo_mint" });

const ROSTER = [MINT, KIKI, XIAOLU, XIAOJU, ZHOU, XIAOYU, ASHAN];

const ALL: RosterQuery = { search: "", role: "all", showArchived: false };

describe("sortRoster", () => {
  it("R01 / T01: groups by role (老師 → 櫃檯 → 外部老師), names in zh-Hant order, archived last in their role", () => {
    const sorted = sortRoster(ROSTER);
    expect(sorted.map((p) => roleToLabel(p.role))).toEqual(["老師", "老師", "老師", "櫃檯", "櫃檯", "櫃檯", "外部老師"]);
    const teachers = sorted.filter((p) => p.role === "teacher");
    expect(teachers.at(-1)).toBe(XIAOLU);
    const activeTeachers = teachers.slice(0, 2).map((p) => p.name);
    expect(activeTeachers).toEqual(["示範小雨", "示範小橘"].sort((a, b) => a.localeCompare(b, "zh-Hant")));
  });

  it("does not mutate its input", () => {
    const input = [...ROSTER];
    sortRoster(input);
    expect(input).toEqual(ROSTER);
  });
});

describe("filterRoster", () => {
  it("R01 / T04: hides archived people by default and counts them", () => {
    const { rows, archivedCount } = filterRoster(ROSTER, ALL);
    expect(rows).not.toContain(XIAOLU);
    expect(rows).toHaveLength(6);
    expect(archivedCount).toBe(1);
  });

  it("R04 / T04: shows archived people when asked, sorted last in their role", () => {
    const { rows, archivedCount } = filterRoster(ROSTER, { ...ALL, showArchived: true });
    expect(rows).toHaveLength(7);
    expect(rows.filter((p) => p.role === "teacher").at(-1)).toBe(XIAOLU);
    expect(archivedCount).toBe(1);
  });

  it("R02 / T02: matches phone ignoring dashes and spaces", () => {
    expect(filterRoster(ROSTER, { ...ALL, search: "0912-345" }).rows).toEqual([XIAOYU]);
    expect(filterRoster(ROSTER, { ...ALL, search: "0912 345 678" }).rows).toEqual([XIAOYU]); // gitleaks:allow
  });

  it("R02 / T02: matches IG and name case-insensitively", () => {
    expect(filterRoster(ROSTER, { ...ALL, search: "XIAOYU" }).rows).toEqual([XIAOYU]);
    expect(filterRoster(ROSTER, { ...ALL, search: "KIKI" }).rows).toEqual([KIKI]);
    expect(filterRoster(ROSTER, { ...ALL, search: " 橘 " }).rows).toEqual([XIAOJU]);
  });

  it("T02: a search without digits never matches by phone", () => {
    expect(filterRoster(ROSTER, { ...ALL, search: "-" }).rows).toEqual([]);
  });

  it("R03 / T03: filters by role and applies the search at the same time", () => {
    expect(filterRoster(ROSTER, { ...ALL, role: "staff" }).rows.map((p) => p.name).sort()).toEqual(
      ["demo_kiki", "示範周", "示範阿山"].sort(),
    );
    expect(filterRoster(ROSTER, { ...ALL, role: "staff", search: "ik" }).rows).toEqual([KIKI]);
    expect(filterRoster(ROSTER, { ...ALL, role: "teacher", search: "ik" }).rows).toEqual([]);
  });

  it("T04: the archived count ignores the search and role filter", () => {
    expect(filterRoster(ROSTER, { ...ALL, role: "staff", search: "demo_kiki" }).archivedCount).toBe(1);
  });
});
