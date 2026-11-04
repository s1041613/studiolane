import { connection } from "next/server";
import { RentalRepository } from "@/server/repositories/rental-repository";
import { RulesRepository } from "@/server/repositories/rules-repository";
import { loadSection } from "@/server/services/section";
import { bookingListFilters } from "@/server/logic/bookings";
import { todayIso } from "@/server/logic/date";
import { BookingsView } from "@/components/bookings/bookings-view";
import { requirePageAccess } from "@/server/auth/require-staff";
import { DesktopShell } from "@/components/desktop/desktop-shell";

export default async function BookingsPage(props: PageProps<"/bookings">) {
  await requirePageAccess("/bookings");
  // Without a request-time API this page prerenders at build time,
  // freezing the rental list; connection() forces per-request rendering so
  // it reflects the current bookings.
  await connection();
  const [section, rules] = await Promise.all([
    loadSection(() => new RentalRepository().listAll()),
    // Only the 下一個空檔 widget reads these.
    loadSection(() => new RulesRepository().listAll()),
  ]);

  // A repeated ?q= makes this a string[]; only a single string value is
  // treated as a query.
  const rawQuery = (await props.searchParams).q;
  const filters = bookingListFilters(typeof rawQuery === "string" ? rawQuery : undefined);

  return (
    <DesktopShell rentals={section.ok ? section.data : null} rules={rules.ok ? rules.data : null}>
      <BookingsView section={section} filters={filters} today={todayIso()} />
    </DesktopShell>
  );
}
