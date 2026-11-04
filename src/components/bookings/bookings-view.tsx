import type { Result } from "@/lib/result";
import { bookingListFilters } from "@/server/logic/bookings";
import type { BookingFilterDraft } from "@/server/logic/bookings";
import type { RentalSummary } from "@/server/types/home";
import { BookingsShelf } from "@/components/bookings/bookings-shelf";
import { SectionFailure } from "@/components/shared/failures/section-failure";
import { WindowToolbar } from "@/components/ui/window";
import { ToolbarTitle } from "@/components/ui/window-toolbar";

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
  if (!section.ok) {
    return (
      <>
        <WindowToolbar>
          <ToolbarTitle>預約冊</ToolbarTitle>
        </WindowToolbar>
        <div className="p-4">
          <SectionFailure message="預約列表暫時讀不到" failure={section.error} />
        </div>
      </>
    );
  }
  // section.data stays unfiltered: BookingsShelf ranks 撞單 and every folder
  // count against every rental, not just the ones a query happens to match.
  // Keyed on q so a new search resets the shelf's selection, open menu, and
  // info panel instead of carrying them over.
  return <BookingsShelf key={filters.q} allRentals={section.data} today={today} q={filters.q} />;
}
