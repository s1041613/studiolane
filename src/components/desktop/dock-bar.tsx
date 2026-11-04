"use client";

import { Dock, DockItem } from "@/components/ui/dock";
import { useDesktopStore } from "@/components/desktop/desktop-store";
import { BOOKINGS_WINDOW_ID, defaultBookingsRect } from "@/components/desktop/bookings-window";
import { defaultKobeyeeRect } from "@/components/desktop/kobeyee";

function BookingLedgerIcon() {
  return (
    <svg viewBox="0 0 56 56" className="size-full" aria-hidden="true">
      <defs>
        <linearGradient id="dock-ledger" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffab3d" />
          <stop offset="1" stopColor="#ff7a1a" />
        </linearGradient>
      </defs>
      <rect width="56" height="56" rx="12.5" fill="url(#dock-ledger)" />
      <path d="M28 17c-4-2.6-9.5-3.3-15-2.4v24.8c5.5-.9 11 0 15 2.6z" fill="#fff" />
      <path d="M28 17c4-2.6 9.5-3.3 15-2.4v24.8c-5.5-.9-11 0-15 2.6z" fill="#fff" opacity="0.88" />
    </svg>
  );
}

function NewBookingIcon() {
  return (
    <svg viewBox="0 0 56 56" className="size-full" aria-hidden="true">
      <rect width="56" height="56" rx="12.5" className="fill-white" />
      <rect x="12" y="15" width="32" height="28" rx="5" className="fill-none stroke-primary" strokeWidth="3" />
      <path d="M12 23h32M20 11v8M36 11v8" className="stroke-primary" strokeWidth="3" strokeLinecap="round" />
      <path d="M28 28v10M23 33h10" className="stroke-primary" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function DockBar() {
  const windows = useDesktopStore((state) => state.windows);
  const toggleWindow = useDesktopStore((state) => state.toggleWindow);
  const open = windows[BOOKINGS_WINDOW_ID]?.open ?? false;
  const bookingOpen = useDesktopStore((state) => state.kobeyee.open && state.kobeyee.layout === "booking");
  const dispatchKobeyee = useDesktopStore((state) => state.dispatchKobeyee);

  return (
    <Dock>
      <DockItem
        label="預約冊"
        active={open}
        icon={<BookingLedgerIcon />}
        onClick={() => toggleWindow(BOOKINGS_WINDOW_ID, defaultBookingsRect())}
      />
      <DockItem
        label="預約教室"
        active={bookingOpen}
        icon={<NewBookingIcon />}
        onClick={() => dispatchKobeyee({ type: "open", layout: "booking", defaultChatRect: defaultKobeyeeRect() })}
      />
    </Dock>
  );
}

export { DockBar };
