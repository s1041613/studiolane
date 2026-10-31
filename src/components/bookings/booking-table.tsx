"use client";

// E-46: the read-only bookings list as one shared Table with stack="md" — a
// table on desktop, each row a two-column card on mobile — plus
// TablePagination underneath.
import { useRef, useState } from "react";
import { conflictInfo, isNextDay, money } from "@/server/logic/home-selectors";
import { shortDateParts } from "@/server/logic/date";
import type { RentalSummary } from "@/server/types/home";
import { paymentStateToLabel, statusToLabel } from "@/server/supabase/codecs";
import type { PaymentStateCode, RentalStatusCode } from "@/server/supabase/codecs";
import { Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TablePagination } from "@/components/ui/table-pagination";

const PAGE_SIZE = 20;

function AlignedDate({ iso }: { iso: string }) {
  const { monthDay, weekday } = shortDateParts(iso);
  return (
    <>
      <span className="inline-block w-[2.9em] tabular-nums">{monthDay}</span>
      {weekday}
    </>
  );
}

// The column heads, also shown above a failed read in place of the rows.
export function BookingTableHeader() {
  return (
    <TableHeader sticky>
      <TableRow className="hover:bg-transparent">
        <TableHead>姓名</TableHead>
        <TableHead width="6.5rem">日期</TableHead>
        <TableHead width="7rem">時段</TableHead>
        <TableHead>教室・用途</TableHead>
        <TableHead width="4.5rem" className="whitespace-nowrap">狀態</TableHead>
        <TableHead width="4.5rem" className="whitespace-nowrap">付款方式</TableHead>
        <TableHead width="4.5rem" className="whitespace-nowrap">付款狀態</TableHead>
        <TableHead align="amount" width="5rem">
          金額
        </TableHead>
      </TableRow>
    </TableHeader>
  );
}

interface BookingTableProps {
  // Already sorted newest first, not yet paginated.
  rows: RentalSummary[];
  allRentals: RentalSummary[];
}

export function BookingTable({ rows, allRentals }: BookingTableProps) {
  const [rawPage, setPage] = useState(1);
  const frameRef = useRef<HTMLDivElement>(null);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  // Clamped, not reset: if `rows` shrinks (e.g. a revalidate drops the
  // last row on the last page), land on the new last page instead of an
  // empty one, and keep it there.
  const page = Math.min(rawPage, pages);
  if (page !== rawPage) setPage(page);
  const shown = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Only fires from TablePagination's own buttons — never on mount, and
  // never when `page` above is merely clamped down (that path writes the
  // page back without coming through here). Desktop scrolls TableFrame's
  // own overflow-y; the stacked mobile layout has no inner scroll (the
  // page itself scrolls), so there it scrolls the frame into view instead.
  // Both browser APIs are feature-detected: older environments (and jsdom,
  // unless a test stubs them) simply skip the scroll instead of throwing.
  function changePage(next: number) {
    setPage(next);
    const frame = frameRef.current;
    if (!frame) return;
    const isDesktop = typeof window.matchMedia === "function" && window.matchMedia("(min-width: 768px)").matches;
    if (isDesktop) {
      frame.scrollTop = 0;
    } else if (typeof frame.scrollIntoView === "function") {
      frame.scrollIntoView({ block: "start" });
    }
  }

  return (
    <>
      <TableFrame ref={frameRef}>
        <Table stack="md" aria-label="預約列表">
          <BookingTableHeader />
          <TableBody>
            {shown.map((rental) => {
              const conflict = conflictInfo(rental, allRentals);
              return (
                <TableRow key={rental.id} data-rent={rental.id} data-status={rental.status}>
                  <TableCell slot="title" label="姓名" className="min-w-0">
                    {/* Long names: truncate on desktop (a real <table> sizes
                        columns to content, so the cap needs an explicit
                        max-width, not just `truncate`), wrap in full on the
                        mobile card. */}
                    <div className="font-medium break-words md:max-w-[14rem] md:truncate">{rental.person}</div>
                    {rental.renterType === "customer" && <div className="text-xs text-muted-foreground">外部客戶</div>}
                    {conflict != null && <div className="text-xs text-warn">撞單 · 第 {conflict} 位</div>}
                  </TableCell>
                  <TableCell label="日期" className="tabular-nums md:whitespace-nowrap">
                    <AlignedDate iso={rental.date} />
                  </TableCell>
                  <TableCell label="時段" className="tabular-nums md:whitespace-nowrap">
                    {rental.start}–{rental.end}
                    {isNextDay(rental) && <span className="ml-1 text-xs text-warn md:ml-0 md:block">（跨日）</span>}
                  </TableCell>
                  <TableCell label="教室・用途">
                    {rental.room}・{rental.purposeLabel}
                  </TableCell>
                  <TableCell label="狀態" className="md:whitespace-nowrap">
                    {/* Plain text like every other cell: no fill, dot, size or colour. */}
                    {statusToLabel(rental.status as RentalStatusCode)}
                  </TableCell>
                  <TableCell label="付款方式" className="md:whitespace-nowrap">
                    {rental.paymentMethodLabel}
                  </TableCell>
                  <TableCell label="付款狀態" className="md:whitespace-nowrap">
                    {paymentStateToLabel(rental.paymentState as PaymentStateCode)}
                  </TableCell>
                  <TableCell label="金額" align="amount" className="md:whitespace-nowrap">
                    {rental.amount != null ? money(rental.amount) : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableFrame>
      <TablePagination page={page} pageSize={PAGE_SIZE} total={rows.length} onPageChange={changePage} />
    </>
  );
}
