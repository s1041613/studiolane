import type { Result } from "@/lib/result";
import { sortBookingsNewestFirst } from "@/server/logic/bookings";
import type { RentalSummary } from "@/server/types/home";
import { Card } from "@/components/ui/card";
import { BookingTable, BookingTableHeader } from "@/components/bookings/booking-table";
import { Table, TableFrame } from "@/components/ui/table";
import { SectionFailure } from "@/components/shared/failures/section-failure";

interface BookingsViewProps {
  // Every rental, or why they couldn't be read; this read-only view has no
  // filters, so it only decides between failure, empty, and the table.
  section: Result<RentalSummary[]>;
}

export function BookingsView({ section }: BookingsViewProps) {
  const rentals = section.ok ? section.data : null;

  return (
    // DESIGN.md §8.3: the table is one card; rows split by hairlines.
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
      {rentals !== null && rentals.length === 0 && (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">目前沒有預約</div>
      )}
      {rentals !== null && rentals.length > 0 && (
        <BookingTable rows={sortBookingsNewestFirst(rentals)} allRentals={rentals} />
      )}
    </Card>
  );
}
