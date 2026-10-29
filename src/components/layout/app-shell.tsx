"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { NAV_ITEMS, isNavActive, pageTitle } from "@/components/layout/nav-items";
import { Logo } from "@/components/layout/logo";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const title = pageTitle(pathname);

  return (
    <>
      <IconRail pathname={pathname} />
      <MobileBar pathname={pathname} />
      {/* On desktop the content area is exactly one screen tall and scrolls
          itself, so a page can let a table card fill down to the bottom
          (flex-1 + min-h-0) and scroll its rows inside the card. max-h-dvh
          because flex-1 in the body's column would otherwise let it grow
          past the window with its content. */}
      <div className="flex flex-1 flex-col px-4 pb-6 md:h-dvh md:max-h-dvh md:overflow-y-auto md:pr-6 md:pl-[calc(var(--eb-content-offset)+16px)]">
        {title && <PageTitle title={title} />}
        {children}
      </div>
    </>
  );
}

function IconRail({ pathname }: { pathname: string }) {
  return (
    <aside className="fixed inset-y-0 left-3.5 z-30 hidden w-(--eb-rail-width) flex-col items-center py-6 md:flex">
      <div className="flex h-10 items-center">
        <Logo />
      </div>
      <nav aria-label="主選單" className="mt-6 flex flex-col gap-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            title={label}
            aria-current={isNavActive(href, pathname) ? "page" : undefined}
            className="grid size-(--eb-size-rail-item) place-items-center rounded-lg bg-icon-btn text-foreground transition-colors duration-150 hover:bg-icon-btn-hover aria-[current=page]:bg-icon-btn-active"
          >
            <Icon aria-hidden className="size-[18px]" />
            <span className="sr-only">{label}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}

function MobileBar({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);

  return (
    <header className="md:hidden">
      <div className="flex h-14 items-center justify-between px-4">
        <Logo />
        <button
          type="button"
          aria-label="開啟選單"
          aria-expanded={open}
          className="grid size-10 place-items-center rounded-lg bg-icon-btn hover:bg-icon-btn-hover"
          onClick={() => setOpen((v) => !v)}
        >
          <Menu aria-hidden className="size-[18px]" />
        </button>
      </div>

      {open && (
        <nav aria-label="主選單" className="flex flex-col border-t border-divider-strong px-4 py-2">
          {NAV_ITEMS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              aria-current={isNavActive(href, pathname) ? "page" : undefined}
              className="py-2 text-sm aria-[current=page]:font-medium"
              onClick={() => setOpen(false)}
            >
              {label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}

export function PageTitleRow({ children }: { children: ReactNode }) {
  return <div className="flex items-center py-4 md:mt-6 md:mb-6 md:h-10 md:py-0">{children}</div>;
}

function PageTitle({ title }: { title: string }) {
  return (
    <PageTitleRow>
      <h1 className="text-[28px] leading-tight font-normal">{title}</h1>
    </PageTitleRow>
  );
}
