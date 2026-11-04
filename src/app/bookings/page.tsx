import { connection } from "next/server";
import { RentalRepository } from "@/server/repositories/rental-repository";
import { loadSection } from "@/server/services/section";
import { initialBookingFilters } from "@/server/logic/bookings";
import { BookingsView } from "@/components/bookings/bookings-view";
import { requirePageAccess } from "@/server/auth/require-staff";
import { DesktopShell } from "@/components/desktop/desktop-shell";

export default async function BookingsPage(props: PageProps<"/bookings">) {
  await requirePageAccess("/bookings");
  // Without a request-time API this page prerenders at build time,
  // freezing the rental list; connection() forces per-request rendering so
  // it reflects the current bookings.
  await connection();
  const section = await loadSection(() => new RentalRepository().listAll());

  // A repeated ?day= makes this a string[]; only a single string value
  // seeds the initial filters (HM21).
  const rawDay = (await props.searchParams).day;
  const initialFilters = initialBookingFilters(typeof rawDay === "string" ? rawDay : undefined);

  return (
    <DesktopShell>
      <BookingsView section={section} initialFilters={initialFilters} />
    </DesktopShell>
  );
}
