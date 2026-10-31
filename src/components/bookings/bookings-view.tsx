import type { Result } from "@/lib/result";
import { bookingListFilters, selectBookingRows, sortBookingsNewestFirst } from "@/server/logic/bookings";
import type { BookingFilterDraft } from "@/server/logic/bookings";
import type { RentalSummary } from "@/server/types/home";
import { Card } from "@/components/ui/card";
import { BookingTable, BookingTableHeader } from "@/components/bookings/booking-table";
import { BookingSearch } from "@/components/bookings/booking-search";
import { Table, TableFrame } from "@/components/ui/table";
import { SectionFailure } from "@/components/shared/failures/section-failure";

interface BookingsViewProps {
  // Every rental, or why they couldn't be read; failure and empty states
  // take priority over the query.
  section: Result<RentalSummary[]>;
  // From ?q=; only q is used until the other BookingFilterDraft fields are
  // wired up.
  filters?: BookingFilterDraft;
}

export function BookingsView({ section, filters = bookingListFilters() }: BookingsViewProps) {
  // allRentals stays unfiltered: conflict ranking (撞單 · 第 N 位) counts
  // against every rental, not just the ones a query happens to match.
  const allRentals = section.ok ? section.data : null;
  const rows = allRentals === null ? [] : sortBookingsNewestFirst(selectBookingRows(allRentals, { q: filters.q }));

  return (
    <>
      <BookingSearch query={filters.q} />
      {/* DESIGN.md §8.3: the table is one card; rows split by hairlines. */}
      <Card padding="none" className="flex flex-col overflow-hidden px-1 pb-1 [--card-pad:0.25rem] md:min-h-0 md:flex-1">
        {!section.ok && (
          <>
            {/* The column heads stay; the failure takes the rows' place. */}
            <TableFrame className="pb-0 md:flex-none">
              <Table stack="md" aria-label="預約列表">
                <BookingTableHeader />
              </Table>
            </TableFrame>
            <SectionFailure message="預約列表暫時讀不到" failure={section.error} />
          </>
        )}
        {allRentals !== null && allRentals.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">目前沒有預約</div>
        )}
        {allRentals !== null && allRentals.length > 0 && rows.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">找不到符合的預約</div>
        )}
        {allRentals !== null && rows.length > 0 && (
          // Keyed on q so a new search starts back on page 1.
          <BookingTable key={filters.q} rows={rows} allRentals={allRentals} />
        )}
      </Card>
    </>
  );
}
