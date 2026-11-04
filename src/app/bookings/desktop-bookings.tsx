"use client";

import type { ComponentProps, ReactNode } from "react";
import { DesktopShell } from "@/components/desktop/desktop-shell";
import { fixtureReader } from "@/components/desktop/kobeyee-fixture";
import { BookingDraftFields, type BookingDraftFieldsData } from "@/components/booking/booking-draft-fields";

type DesktopBookingsProps = Pick<ComponentProps<typeof DesktopShell>, "rentals" | "rules"> & {
  formData: BookingDraftFieldsData;
  children: ReactNode;
};

// The one place that sees both desktop/ and booking/: it binds the Kobeyee
// window's form slot to the booking fields. A client file because a render
// prop can't cross from a server component.
export function DesktopBookings({ formData, rentals, rules, children }: DesktopBookingsProps) {
  return (
    <DesktopShell rentals={rentals} rules={rules} reader={fixtureReader} renderBookingForm={(form) => <BookingDraftFields {...form} data={formData} />}>
      {children}
    </DesktopShell>
  );
}
