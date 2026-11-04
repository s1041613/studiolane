import type { Result } from "@/lib/result";
import { bookingListFilters } from "@/server/logic/bookings";
import type { BookingFilterDraft } from "@/server/logic/bookings";
import type { RentalSummary } from "@/server/types/home";
import { Card } from "@/components/ui/card";
import { BookingsShelf } from "@/components/bookings/bookings-shelf";
import { BookingSearch } from "@/components/bookings/booking-search";
import { SectionFailure } from "@/components/shared/failures/section-failure";

interface BookingsViewProps {
  // Every rental, or why they couldn't be read; failure and empty states
  // take priority over the query.
  section: Result<RentalSummary[]>;
  // From ?q=; only q is used until the other BookingFilterDraft fields are
  // wired up.
  filters?: BookingFilterDraft;
  // Asia/Taipei "today", for the 預約冊's 今天/本週 folders.
  today: string;
}

export function BookingsView({ section, filters = bookingListFilters(), today }: BookingsViewProps) {
  // allRentals stays unfiltered: BookingsShelf ranks 撞單 and every folder
  // count against every rental, not just the ones a query happens to match.
  const allRentals = section.ok ? section.data : null;

  return (
    <>
      <BookingSearch query={filters.q} />
      {/* DESIGN.md §8.3: the shelf is one card; the sidebar and table split
          by a hairline inside it. */}
      <Card padding="none" className="flex flex-col overflow-hidden px-1 pb-1 [--card-pad:0.25rem] md:min-h-0 md:flex-1">
        {!section.ok && <SectionFailure message="預約列表暫時讀不到" failure={section.error} />}
        {allRentals !== null && (
          // Keyed on q so a new search resets the shelf's selection, open
          // menu, and info panel instead of carrying them over.
          <BookingsShelf key={filters.q} allRentals={allRentals} today={today} q={filters.q} />
        )}
      </Card>
    </>
  );
}
