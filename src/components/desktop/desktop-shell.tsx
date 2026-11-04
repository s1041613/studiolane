"use client";

import { Suspense, use, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { MenuBar } from "@/components/desktop/menu-bar";
import { DockBar } from "@/components/desktop/dock-bar";
import { BookingsWindow } from "@/components/desktop/bookings-window";
import { PreparingWindow } from "@/components/desktop/preparing-window";
import { preparingTitle } from "@/components/desktop/preparing";
import { KobeyeeWindow, type KobeyeeWindowProps } from "@/components/desktop/kobeyee-window";
import { KobeyeeCat } from "@/components/desktop/kobeyee-cat";
import { DesktopWidgets, DesktopWidgetsSkeleton, type DesktopSections } from "@/components/desktop/desktop-widgets";
import { isAnyWindowOpen, useDesktopStore } from "@/components/desktop/desktop-store";

// Blue gradient wallpaper, inspired by classic desktop UIs.
const WALLPAPER_GRADIENT = [
  "radial-gradient(120% 60% at 30% 120%, rgba(120,200,255,.55), rgba(120,200,255,0) 60%)",
  "radial-gradient(90% 40% at 80% 30%, rgba(90,170,255,.45), rgba(90,170,255,0) 70%)",
  "linear-gradient(180deg, #0a2f78 0%, #1356b8 45%, #2a7fe0 70%, #0d3f9a 100%)",
].join(", ");

interface DesktopShellProps extends KobeyeeWindowProps {
  // Not awaited by the layout, so the chrome below doesn't wait on it; only
  // the widgets suspend on it, inside their own boundary.
  sectionsPromise: Promise<DesktopSections>;
  // The 預約冊 window's content, shown only on /bookings.
  children: ReactNode;
}

// Resolves sectionsPromise with React's use(), suspending just this
// subtree (see the Suspense boundary below) instead of the whole shell.
function ResolvedDesktopWidgets({ hidden, sectionsPromise }: { hidden: boolean; sectionsPromise: Promise<DesktopSections> }) {
  const { rentals, rules } = use(sectionsPromise);
  return <DesktopWidgets hidden={hidden} rentals={rentals} rules={rules} />;
}

// The desktop itself: a full-viewport shell with a menu bar, wallpaper,
// widgets, a Dock, and the 預約冊 window, shared by `/` and `/bookings`.
// `children` is BookingsView on /bookings, rendered unchanged inside the
// window; null on `/`, where the window stays closed. The booking form
// comes in as a render prop because desktop/ can't import booking/.
function DesktopShell({ sectionsPromise, children, reader, submitter, renderBookingForm }: DesktopShellProps) {
  // A layout's `children` is never null (Next wraps every page in its own
  // boundary), so the pathname, not the page's output, is the open state.
  const pathname = usePathname();
  const bookingsOpen = pathname === "/bookings";
  const preparing = preparingTitle(pathname);
  const kobeyeeOpen = useDesktopStore((state) => state.kobeyee.open);
  const windowOpen = isAnyWindowOpen(kobeyeeOpen, bookingsOpen || preparing !== null);

  return (
    <div className="fixed inset-0 overflow-hidden" style={{ background: "#0b3a8c" }}>
      <div
        aria-hidden="true"
        className="absolute inset-0 transition-[filter] duration-300"
        style={{ background: WALLPAPER_GRADIENT, filter: windowOpen ? "blur(22px) brightness(0.75)" : "none" }}
      />
      <Suspense fallback={<DesktopWidgetsSkeleton hidden={windowOpen} />}>
        <ResolvedDesktopWidgets hidden={windowOpen} sectionsPromise={sectionsPromise} />
      </Suspense>
      <MenuBar />
      <BookingsWindow open={bookingsOpen}>{children}</BookingsWindow>
      <PreparingWindow title={preparing} />
      <KobeyeeWindow reader={reader} submitter={submitter} renderBookingForm={renderBookingForm} />
      <KobeyeeCat />
      <DockBar bookingsOpen={bookingsOpen} />
    </div>
  );
}

export { DesktopShell };
