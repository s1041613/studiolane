"use client";

import { Suspense, use, type ComponentProps, type ReactNode } from "react";
import { DesktopShell } from "@/components/desktop/desktop-shell";
import { fixtureReader } from "@/components/desktop/kobeyee-fixture";
import type { BookingFormSlotProps } from "@/components/desktop/kobeyee-window";
import { Skeleton } from "@/components/ui/skeleton";
import { BookingDraftFields, type BookingDraftFieldsData } from "@/components/booking/booking-draft-fields";

type DesktopBookingsProps = Pick<ComponentProps<typeof DesktopShell>, "sectionsPromise"> & {
  formDataPromise: Promise<BookingDraftFieldsData>;
  children: ReactNode;
};

// A thin placeholder while formDataPromise is still pending; the Kobeyee
// window is closed by default, so this only ever shows if someone opens
// 預約教室 before the request-time read resolves.
function BookingFormSkeleton() {
  return (
    <div className="flex flex-col gap-2.5 p-3">
      {Array.from({ length: 5 }, (_, index) => (
        <Skeleton key={index} className="h-9 w-full" />
      ))}
    </div>
  );
}

// Resolves formDataPromise with React's use(), inside its own Suspense
// boundary below, so a slow read never blocks the shell that renders above
// it instantly.
function ResolvedBookingForm({ formDataPromise, ...form }: BookingFormSlotProps & { formDataPromise: Promise<BookingDraftFieldsData> }) {
  const data = use(formDataPromise);
  return <BookingDraftFields {...form} data={data} />;
}

// The one place that sees both desktop/ and booking/: it binds the Kobeyee
// window's form slot to the booking fields. A client file because a render
// prop can't cross from a server component.
export function DesktopBookings({ sectionsPromise, formDataPromise, children }: DesktopBookingsProps) {
  return (
    <DesktopShell
      sectionsPromise={sectionsPromise}
      reader={fixtureReader}
      renderBookingForm={(form) => (
        <Suspense fallback={<BookingFormSkeleton />}>
          <ResolvedBookingForm formDataPromise={formDataPromise} {...form} />
        </Suspense>
      )}
    >
      {children}
    </DesktopShell>
  );
}
