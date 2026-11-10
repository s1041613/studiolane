import { getRentalsSection } from "@/server/services/desktop-sections";
import { bookingListFilters } from "@/server/logic/bookings";
import { todayIso } from "@/server/logic/date";
import { BookingsView } from "@/components/bookings/bookings-view";
import { requirePageAccess } from "@/server/auth/require-staff";

// Only the 預約冊 window's content: the desktop shell itself (and the
// rentals/rules/booking-form data it needs) comes from the (desktop) group
// layout, which wraps this page and opens the window because it's present.
export default async function BookingsPage(props: PageProps<"/bookings">) {
  await requirePageAccess("/bookings");
  const section = await getRentalsSection();

  // A repeated ?q= makes this a string[]; only a single string value is
  // treated as a query.
  const rawQuery = (await props.searchParams).q;
  const filters = bookingListFilters(typeof rawQuery === "string" ? rawQuery : undefined);

  return <BookingsView section={section} filters={filters} today={todayIso()} />;
}
