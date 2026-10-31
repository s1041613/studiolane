import { connection } from "next/server";
import { RentalRepository } from "@/server/repositories/rental-repository";
import { loadSection } from "@/server/services/section";
import { bookingListFilters } from "@/server/logic/bookings";
import { BookingsView } from "@/components/bookings/bookings-view";
import { requirePageAccess } from "@/server/auth/require-staff";

export default async function BookingsPage(props: PageProps<"/bookings">) {
  await requirePageAccess("/bookings");
  // Without a request-time API this page prerenders at build time,
  // freezing the rental list; connection() forces per-request rendering so
  // it reflects the current bookings.
  await connection();
  const section = await loadSection(() => new RentalRepository().listAll());

  // A repeated ?q= makes this a string[]; only a single string value is
  // treated as a query.
  const rawQuery = (await props.searchParams).q;
  const filters = bookingListFilters(typeof rawQuery === "string" ? rawQuery : undefined);

  return (
    <main className="flex w-full flex-1 flex-col gap-6 md:min-h-0">
      <BookingsView section={section} filters={filters} />
    </main>
  );
}
