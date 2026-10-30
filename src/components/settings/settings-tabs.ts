export interface SettingsTab {
  label: string;
  href: string;
  // Unfinished pages stay hidden so they never show up as dead tabs (SH05).
  ready: boolean;
}

// C1: every settings page in display order, registered up front so each
// page's branch only flips its own `ready` line instead of appending to the
// list (which would conflict across parallel branches).
export const ALL_SETTINGS_TABS: readonly SettingsTab[] = [
  { label: "人員名單", href: "/settings/roster", ready: true },
  { label: "價格方案", href: "/settings/pricing", ready: true },
  { label: "租借時段", href: "/settings/rules", ready: true },
  { label: "用途", href: "/settings/purposes", ready: true },
];

export const SETTINGS_TABS: readonly SettingsTab[] = ALL_SETTINGS_TABS.filter((tab) => tab.ready);

export const SETTINGS_HOME = SETTINGS_TABS[0].href;

function isUnder(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Nested routes (e.g. /settings/roster/123) still belong to their tab.
export function currentSettingsTab(pathname: string): SettingsTab | null {
  return SETTINGS_TABS.find((tab) => isUnder(tab.href, pathname)) ?? null;
}
