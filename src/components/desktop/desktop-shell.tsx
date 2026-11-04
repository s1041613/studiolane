"use client";

import type { ReactNode } from "react";
import { MenuBar } from "@/components/desktop/menu-bar";
import { DockBar } from "@/components/desktop/dock-bar";
import { BookingsWindow } from "@/components/desktop/bookings-window";
import { KobeyeeWindow } from "@/components/desktop/kobeyee-window";
import { KobeyeeCat } from "@/components/desktop/kobeyee-cat";
import { DesktopWidgets } from "@/components/desktop/desktop-widgets";
import { isAnyWindowOpen, useDesktopStore } from "@/components/desktop/desktop-store";

// Blue gradient wallpaper, inspired by classic desktop UIs.
const WALLPAPER_GRADIENT = [
  "radial-gradient(120% 60% at 30% 120%, rgba(120,200,255,.55), rgba(120,200,255,0) 60%)",
  "radial-gradient(90% 40% at 80% 30%, rgba(90,170,255,.45), rgba(90,170,255,0) 70%)",
  "linear-gradient(180deg, #0a2f78 0%, #1356b8 45%, #2a7fe0 70%, #0d3f9a 100%)",
].join(", ");

interface DesktopShellProps {
  children: ReactNode;
}

// Replaces /bookings' page shell: a full-viewport desktop with a menu bar,
// wallpaper, widgets, a Dock, and the 預約冊 window. `children` is the existing
// BookingsView, rendered unchanged inside the window.
function DesktopShell({ children }: DesktopShellProps) {
  const windowOpen = useDesktopStore((state) => isAnyWindowOpen(state.windows));

  return (
    <div className="fixed inset-0 overflow-hidden" style={{ background: "#0b3a8c" }}>
      <div
        aria-hidden="true"
        className="absolute inset-0 transition-[filter] duration-300"
        style={{ background: WALLPAPER_GRADIENT, filter: windowOpen ? "blur(22px) brightness(0.75)" : "none" }}
      />
      <DesktopWidgets hidden={windowOpen} />
      <MenuBar />
      <BookingsWindow>{children}</BookingsWindow>
      <KobeyeeWindow />
      <KobeyeeCat />
      <DockBar />
    </div>
  );
}

export { DesktopShell };
