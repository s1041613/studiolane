"use client";

import { useEffect, useState } from "react";
import type { Result } from "@/lib/result";
import { selectBookingRows } from "@/server/logic/bookings";
import type { BookingFilterDraft } from "@/server/logic/bookings";
import { PaymentMethod } from "@/server/types/home";
import type { RentalSummary } from "@/server/types/home";
import { Card } from "@/components/ui/card";
import { BookingFilters } from "@/components/bookings/booking-filters";
import { BookingTable, BookingTableHeader } from "@/components/bookings/booking-table";
import { Table, TableFrame } from "@/components/ui/table";
import { SectionFailure } from "@/components/shared/failures/section-failure";

function payFilter(pay: string): PaymentMethod | "none" | undefined {
  if (pay === "none") return "none";
  return Object.values(PaymentMethod).includes(pay as PaymentMethod) ? (pay as PaymentMethod) : undefined;
}

interface BookingsViewProps {
  // Every rental, or why they couldn't be read; filtering happens here.
  section: Result<RentalSummary[]>;
  initialFilters: BookingFilterDraft;
}

// 預約追蹤's filters live only on the page: a reload or coming back through
// the rail starts from the default again. A day passed by 首頁's ↗ seeds
// the first view and is then dropped from the URL, so reloading after it
// also lands on the default.
export function BookingsView({ section, initialFilters }: BookingsViewProps) {
  const rentals = section.ok ? section.data : null;
  const [filters, setFilters] = useState(initialFilters);

  useEffect(() => {
    if (window.location.search) window.history.replaceState(null, "", "/bookings");
  }, []);

  const rows = rentals
    ? selectBookingRows(rentals, {
        q: filters.q,
        pay: payFilter(filters.pay),
        statuses: filters.statuses,
        from: filters.from || undefined,
        to: filters.to || undefined,
      })
    : [];

  return (
    <>
      <BookingFilters initial={filters} onApply={setFilters} />
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
        {rentals !== null && rows.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">沒有符合條件的預約</div>
        )}
        {rows.length > 0 && rentals && (
          // Keyed on the filters so changing a filter remounts the table
          // (and so its page resets to 1), while an action-driven refresh
          // of `rentals` — same filters, new rows — keeps the same instance
          // and stays on the same page.
          <BookingTable key={JSON.stringify(filters)} rows={rows} allRentals={rentals} />
        )}
      </Card>
    </>
  );
}
