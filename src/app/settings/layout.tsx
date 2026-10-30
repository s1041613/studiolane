"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SETTINGS_TABS, currentSettingsTab } from "@/components/settings/settings-tabs";

// Minimal settings frame: just the tab bar every /settings page shares.
// The page title comes from the app shell (nav-items.ts already maps every
// /settings/* path to 「設定」); a client component because layouts don't
// re-render on navigation and so can't read the pathname otherwise.
function SettingsTabs() {
  const pathname = usePathname();
  const current = currentSettingsTab(pathname);
  const currentTabRef = useRef<HTMLAnchorElement>(null);

  // On a narrow screen the tabs scroll sideways; keep the current one in
  // view after navigating or reloading.
  useEffect(() => {
    currentTabRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname]);

  return (
    <nav aria-label="設定項目" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      {/* DESIGN.md §5.4 底線分頁: text only, 28px apart on one full-width
          hairline; the current page is dark, 500, with a 2px underline. */}
      <div className="flex w-max min-w-full gap-7 border-b border-divider-header">
        {SETTINGS_TABS.map((tab) => {
          const isCurrent = tab === current;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              ref={isCurrent ? currentTabRef : undefined}
              aria-current={isCurrent ? "page" : undefined}
              className="-mb-px whitespace-nowrap border-b-2 border-transparent py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:border-foreground aria-[current=page]:font-medium aria-[current=page]:text-foreground"
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-full flex-1 flex-col gap-6 md:min-h-0">
      <SettingsTabs />
      {children}
    </div>
  );
}
