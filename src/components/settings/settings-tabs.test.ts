import { describe, expect, it } from "vitest";
import { ALL_SETTINGS_TABS, SETTINGS_TABS, currentSettingsTab } from "@/components/settings/settings-tabs";

describe("settings tabs", () => {
  it("SH01 / T01: picks the tab the pathname is on, including nested routes", () => {
    expect(currentSettingsTab("/settings/roster")?.label).toBe("人員名單");
    expect(currentSettingsTab("/settings/roster/123")?.label).toBe("人員名單");
  });

  it("T01: does not match a different page that merely shares the prefix", () => {
    expect(currentSettingsTab("/settings/rosterx")).toBeNull();
    expect(currentSettingsTab("/settings")).toBeNull();
  });

  // Written against the ready flags rather than a fixed list, so each
  // settings page flipping its own flag doesn't have to touch this test.
  it("SH05 / T05: lists only pages that have shipped", () => {
    const shown = SETTINGS_TABS.map((t) => t.href);
    for (const tab of ALL_SETTINGS_TABS) {
      expect(shown.includes(tab.href)).toBe(tab.ready);
    }
    expect(shown).toContain("/settings/roster");
  });

  it("T05: every planned page is registered in display order, each with its own ready flag", () => {
    expect(ALL_SETTINGS_TABS.map((t) => t.href)).toEqual([
      "/settings/roster",
      "/settings/pricing",
      "/settings/rules",
      "/settings/purposes",
    ]);
    expect(SETTINGS_TABS).toEqual(ALL_SETTINGS_TABS.filter((t) => t.ready));
  });
});
