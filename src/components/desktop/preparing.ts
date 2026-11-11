// S-準備中: three routes (/settings/rules, /bookings/new,
// /bookings/batch/<id>) have no finished UI yet. Instead of rendering their
// real page with no chrome, DesktopShell shows PreparingWindow, titled by
// this pathname → page-name mapping. A pathname that matches none of these
// returns null, which keeps the window closed.
const PREPARING_ROUTES: readonly { match: (pathname: string) => boolean; title: string }[] = [
  { match: (pathname) => pathname === "/settings/rules", title: "設定" },
  { match: (pathname) => pathname === "/bookings/new", title: "預約教室" },
  { match: (pathname) => pathname.startsWith("/bookings/batch/"), title: "預約明細" },
];

export function preparingTitle(pathname: string): string | null {
  return PREPARING_ROUTES.find(({ match }) => match(pathname))?.title ?? null;
}
