import { WindowPane, WindowStatusBar, WindowToolbar } from "@/components/ui/window";
import { ToolbarTitle } from "@/components/ui/window-toolbar";
import { Skeleton } from "@/components/ui/skeleton";

// Scene 2 in docs/desktop-home/mockup/loading-states.html: the 預約冊
// window opens immediately on navigation (it's chrome, from DesktopShell,
// not this file); this is only what fills its body while BookingsPage
// awaits the rentals read. Same outer grid as BookingsShelf
// (components/bookings/bookings-shelf.tsx) so swapping in the real content
// never shifts the layout, and the same WindowToolbar/ToolbarTitle pairing
// BookingsView already uses on its own failure branch, so the title never
// goes missing while this streams.
export default function BookingsLoading() {
  return (
    <>
      <WindowToolbar>
        <ToolbarTitle>預約冊</ToolbarTitle>
      </WindowToolbar>
      <div className="grid min-h-0 flex-1 grid-cols-[196px_minmax(0,1fr)] gap-[7px] px-2 py-[7px] max-sm:grid-cols-1">
        <WindowPane aria-hidden="true" className="p-3 max-sm:hidden">
          <div className="flex flex-col gap-4 pt-1">
            {["70%", "90%", "55%", "80%", "65%", "85%"].map((width, index) => (
              <Skeleton key={index} className="h-3" style={{ width }} />
            ))}
          </div>
        </WindowPane>
        <WindowPane aria-hidden="true" className="p-3">
          <div className="flex flex-col gap-5 pt-2">
            {Array.from({ length: 8 }, (_, index) => (
              <Skeleton key={index} className="h-3 w-full" />
            ))}
          </div>
        </WindowPane>
      </div>
      <WindowStatusBar />
    </>
  );
}
