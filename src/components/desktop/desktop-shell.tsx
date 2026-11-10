"use client";

import type { ReactNode } from "react";
import { MenuBar } from "@/components/desktop/menu-bar";
import { DockBar } from "@/components/desktop/dock-bar";
import { BookingsWindow } from "@/components/desktop/bookings-window";
import { KobeyeeWindow, type KobeyeeWindowProps } from "@/components/desktop/kobeyee-window";
import { KobeyeeCat } from "@/components/desktop/kobeyee-cat";
import { DesktopWidgets } from "@/components/desktop/desktop-widgets";
import { isAnyWindowOpen, useDesktopStore } from "@/components/desktop/desktop-store";
import type { RentalSummary } from "@/server/types/home";
import type { RentalRule } from "@/server/logic/booking-rules";

// Blue gradient wallpaper, inspired by classic desktop UIs.
const WALLPAPER_GRADIENT = [
  "radial-gradient(120% 60% at 30% 120%, rgba(120,200,255,.55), rgba(120,200,255,0) 60%)",
  "radial-gradient(90% 40% at 80% 30%, rgba(90,170,255,.45), rgba(90,170,255,0) 70%)",
  "linear-gradient(180deg, #0a2f78 0%, #1356b8 45%, #2a7fe0 70%, #0d3f9a 100%)",
].join(", ");

interface DesktopShellProps extends KobeyeeWindowProps {
  // The widgets' data; null when that read failed.
  rentals: readonly RentalSummary[] | null;
  rules: readonly RentalRule[] | null;
  // The 預約冊 window's content; null on every route but /bookings.
  children: ReactNode;
}

// The desktop itself: a full-viewport shell with a menu bar, wallpaper,
// widgets, a Dock, and the 預約冊 window, shared by `/` and `/bookings`.
// `children` is BookingsView on /bookings, rendered unchanged inside the
// window; null on `/`, where the window stays closed. The booking form
// comes in as a render prop because desktop/ can't import booking/.
function DesktopShell({ rentals, rules, children, reader, renderBookingForm }: DesktopShellProps) {
  const windowOpen = useDesktopStore((state) => isAnyWindowOpen(state));

  return (
    <div className="fixed inset-0 overflow-hidden" style={{ background: "#0b3a8c" }}>
      <div
        aria-hidden="true"
        className="absolute inset-0 transition-[filter] duration-300"
        style={{ background: WALLPAPER_GRADIENT, filter: windowOpen ? "blur(22px) brightness(0.75)" : "none" }}
      />
      <DesktopWidgets hidden={windowOpen} rentals={rentals} rules={rules} />
      <MenuBar />
      <BookingsWindow>{children}</BookingsWindow>
      <KobeyeeWindow reader={reader} renderBookingForm={renderBookingForm} />
      <KobeyeeCat />
      <DockBar />
    </div>
  );
}

export { DesktopShell };
