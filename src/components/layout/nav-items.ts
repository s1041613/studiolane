import { CalendarPlus, LayoutGrid, Settings, type LucideIcon } from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "首頁", href: "/", icon: LayoutGrid },
  { label: "預約教室", href: "/bookings/new", icon: CalendarPlus },
  { label: "設定", href: "/settings", icon: Settings },
];

export function isNavActive(href: string, pathname: string): boolean {
  const matches = (h: string) => (h === "/" ? pathname === "/" : pathname === h || pathname.startsWith(`${h}/`));
  if (!matches(href)) return false;
  return !NAV_ITEMS.some((item) => item.href.length > href.length && matches(item.href));
}

const PAGE_TITLES: Record<string, string> = {
  "/bookings/new": "預約教室",
};

export function pageTitle(pathname: string): string | null {
  if (pathname === "/settings" || pathname.startsWith("/settings/")) return "設定";
  return PAGE_TITLES[pathname] ?? null;
}
