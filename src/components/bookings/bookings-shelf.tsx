"use client";

// 預約冊: a sidebar of folders (period / room / status / clash) next to one
// sortable list of rows, with the window's toolbar (folder history, title,
// search) and status bar. Search (?q=) is a GET form in the toolbar;
// folder selection and its history, sort, row selection, and the open
// status menu are all client-only state — nothing here
// is remembered across a reload.
import { useMemo, useState } from "react";
import Form from "next/form";
import { cn } from "cn";
import { conflictInfo, isNextDay, money, paymentTag } from "@/server/logic/home-selectors";
import { shortDateParts } from "@/server/logic/date";
import {
  DEFAULT_SHELF_FILTER,
  DEFAULT_SHELF_SORT,
  folderActive,
  nextShelfSort,
  rivalText,
  searchShelfRows,
  shelfCount,
  shelfRows,
  shelfStatusText,
  SHELF_SECTIONS,
  sortShelfRows,
  toggleFolder,
  withFolder,
} from "@/server/logic/shelf";
import type { ShelfFilter, ShelfSort, ShelfSortKey } from "@/server/logic/shelf";
import { roomToLabel } from "@/server/supabase/codecs";
import type { RoomCode } from "@/server/supabase/codecs";
import { RentalStatus } from "@/server/types/home";
import type { RentalSummary } from "@/server/types/home";
import { BookingActions } from "@/components/bookings/booking-actions";
import { SidebarList } from "@/components/ui/sidebar-list";
import type { FolderGlyph, SidebarSection } from "@/components/ui/sidebar-list";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ColumnWidth } from "@/components/ui/table";
import { WindowPane, WindowStatusBar, WindowToolbar } from "@/components/ui/window";
import {
  BackIcon,
  ForwardIcon,
  ToolbarButton,
  ToolbarButtonGroup,
  ToolbarSearch,
  ToolbarTitle,
} from "@/components/ui/window-toolbar";

interface BookingsShelfProps {
  allRentals: RentalSummary[];
  today: string;
  // Already trimmed by the page; applies on top of whichever folder is selected.
  q: string;
}

const NEEDS_DECISION = new Set<RentalStatus>([RentalStatus.Pending, RentalStatus.AwaitingPayment]);
const CLOSED = new Set<RentalStatus>([RentalStatus.Completed, RentalStatus.Postponed, RentalStatus.Cancelled]);

function folderGlyph(key: string): FolderGlyph {
  if (key === "period:today") return "today";
  if (key === "period:week") return "week";
  if (key === "period:all") return "all";
  if (key.startsWith("room:")) return "room";
  return "list";
}

const COLUMNS: { key: ShelfSortKey; label: string; width: ColumnWidth; amount?: boolean }[] = [
  { key: "date", label: "日期", width: "9.3%" },
  { key: "time", label: "時段", width: "12.5%" },
  { key: "renter", label: "租借人", width: "13%" },
  { key: "purpose", label: "用途", width: "11%" },
  { key: "room", label: "教室", width: "9%" },
  { key: "status", label: "狀態", width: "10%" },
  { key: "payment", label: "付款", width: "10%" },
  { key: "amount", label: "金額", width: "8%", amount: true },
  { key: "note", label: "備註", width: "17.2%" },
];

// Back/forward walk the folder selections made in this window, like a
// browser's history: picking a folder after going back drops what was ahead.
interface FilterHistory {
  entries: ShelfFilter[];
  index: number;
}

export function BookingsShelf({ allRentals, today, q }: BookingsShelfProps) {
  const [history, setHistory] = useState<FilterHistory>({ entries: [DEFAULT_SHELF_FILTER], index: 0 });
  const [sort, setSort] = useState<ShelfSort>(DEFAULT_SHELF_SORT);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const filter = history.entries[history.index];

  const rows = useMemo(
    () => sortShelfRows(searchShelfRows(shelfRows(allRentals, filter, today), q), sort, allRentals),
    [allRentals, filter, today, q, sort],
  );

  function stepHistory(delta: -1 | 1) {
    setHistory(({ entries, index }) => ({ entries, index: Math.min(Math.max(index + delta, 0), entries.length - 1) }));
  }

  const sections: SidebarSection[] = useMemo(
    () =>
      SHELF_SECTIONS.map((section) => ({
        title: section.title,
        items: section.items.map((item) => {
          const count = shelfCount(allRentals, withFolder(filter, item), today);
          const needsDecision = item.facet === "status" && NEEDS_DECISION.has(item.value as RentalStatus);
          return {
            key: item.key,
            label: item.label,
            count,
            glyph: folderGlyph(item.key),
            active: folderActive(filter, item),
            tone: count > 0 ? (item.isClash ? ("danger" as const) : needsDecision ? ("accent" as const) : undefined) : undefined,
            onClick: () => setHistory(({ entries, index }) => {
              const next = toggleFolder(entries[index], item);
              return { entries: [...entries.slice(0, index + 1), next], index: index + 1 };
            }),
          };
        }),
      })),
    [allRentals, filter, today],
  );

  function selectRow(id: string) {
    setSelectedId(id);
  }

  function openRowMenu(rental: RentalSummary, event: React.MouseEvent) {
    event.preventDefault();
    setSelectedId(rental.id);
    setOpenMenuId(rental.id);
  }

  function onGridKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (rows.length === 0) return;
      const index = rows.findIndex((r) => r.id === selectedId);
      const next = event.key === "ArrowDown" ? Math.min(index + 1, rows.length - 1) : Math.max(index - 1, 0);
      setSelectedId(rows[next === -1 ? 0 : next].id);
      return;
    }
    if (event.key === "Escape" && openMenuId) {
      event.preventDefault();
      setOpenMenuId(null);
    }
  }

  return (
    <>
      <WindowToolbar>
        <ToolbarButtonGroup>
          <ToolbarButton aria-label="上一頁" disabled={history.index === 0} onClick={() => stepHistory(-1)}>
            <BackIcon />
          </ToolbarButton>
          <ToolbarButton
            aria-label="下一頁"
            disabled={history.index === history.entries.length - 1}
            onClick={() => stepHistory(1)}
          >
            <ForwardIcon />
          </ToolbarButton>
        </ToolbarButtonGroup>
        <ToolbarTitle>預約冊</ToolbarTitle>
        {/* Keyed by query so a navigation (submit, or 清除) remounts the
            input instead of leaving its uncontrolled value stale. */}
        <Form key={q} action="/bookings">
          <ToolbarSearch
            name="q"
            aria-label="搜尋"
            placeholder="搜尋"
            defaultValue={q}
            clearHref={q !== "" ? "/bookings" : undefined}
            clearLabel="清除"
          />
        </Form>
      </WindowToolbar>
      <div className="grid min-h-0 flex-1 grid-cols-[196px_minmax(0,1fr)] gap-[7px] px-2 py-[7px] max-sm:grid-cols-1">
        <SidebarList sections={sections} label="預約冊資料夾" className="max-sm:hidden" />
        <WindowPane>
          {rows.length === 0 ? (
            <p className="my-[60px] text-center text-sm text-muted-foreground">
              {allRentals.length === 0 ? "目前沒有預約" : "找不到符合的預約"}
            </p>
          ) : (
            <TableFrame className="flex-1 px-1 pb-0 md:min-h-0 md:flex-1">
              <Table
                stack="md"
                density="compact"
                aria-label="預約"
                role="grid"
                tabIndex={0}
                onKeyDown={onGridKeyDown}
                aria-rowcount={rows.length}
                className="table-fixed text-[13px] outline-none"
              >
                <TableHeader sticky>
                  <TableRow className="hover:bg-transparent">
                    {COLUMNS.map((column, index) => (
                      <TableHead
                        key={column.key}
                        width={column.width}
                        align={column.amount ? "amount" : "start"}
                        className={index === 0 ? "pl-3" : undefined}
                        sort={{
                          direction: sort.key === column.key ? sort.direction : null,
                          onSort: () => setSort(nextShelfSort(sort, column.key)),
                        }}
                      >
                        {column.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((rental) => (
                    <BookingRow
                      key={rental.id}
                      rental={rental}
                      allRentals={allRentals}
                      selected={rental.id === selectedId}
                      menuOpen={rental.id === openMenuId}
                      onMenuOpenChange={(open) => setOpenMenuId(open ? rental.id : null)}
                      onSelect={() => selectRow(rental.id)}
                      onContextMenu={(event) => openRowMenu(rental, event)}
                    />
                  ))}
                </TableBody>
              </Table>
            </TableFrame>
          )}

        </WindowPane>
      </div>
      <WindowStatusBar>{shelfStatusText(rows, q)}</WindowStatusBar>
    </>
  );
}

interface BookingRowProps {
  rental: RentalSummary;
  allRentals: RentalSummary[];
  selected: boolean;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onSelect: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
}

function BookingRow({
  rental,
  allRentals,
  selected,
  menuOpen,
  onMenuOpenChange,
  onSelect,
  onContextMenu,
}: BookingRowProps) {
  const clashing = conflictInfo(rental, allRentals) != null;
  const closed = CLOSED.has(rental.status);

  return (
    <TableRow
      data-rent={rental.id}
      data-status={rental.status}
      role="row"
      aria-selected={selected}
      className={cn("group cursor-default select-none", closed && "text-text-secondary")}
      onClick={onSelect}
      onContextMenu={onContextMenu}
    >
      <TableCell label="日期" className="tabular-nums whitespace-nowrap">
        {clashing ? (
          <Tooltip>
            <TooltipTrigger render={<span tabIndex={0} />} className="cursor-default font-semibold text-destructive">
              {shortDateParts(rental.date).monthDay}
              {/* The red date alone carries no meaning for a screen reader. */}
              <span className="sr-only">撞單</span>
            </TooltipTrigger>
            <TooltipContent>{rivalText(rental, allRentals)}</TooltipContent>
          </Tooltip>
        ) : (
          shortDateParts(rental.date).monthDay
        )}
      </TableCell>
      <TableCell label="時段" className="tabular-nums whitespace-nowrap">
        {rental.start}–{rental.end}
        {isNextDay(rental) && <span className="ml-1 text-xs text-muted-foreground">（跨日）</span>}
      </TableCell>
      <TableCell slot="title" label="租借人" className="truncate font-semibold">
        {rental.person}
      </TableCell>
      <TableCell label="用途" className="truncate">
        {rental.purposeLabel}
      </TableCell>
      <TableCell label="教室" className="whitespace-nowrap">
        {roomToLabel(rental.room as RoomCode)}
      </TableCell>
      <TableCell label="狀態" className="whitespace-nowrap">
        <BookingActions
          rental={rental}
          open={menuOpen}
          onOpenChange={onMenuOpenChange}
          emphasized={NEEDS_DECISION.has(rental.status)}
        />
      </TableCell>
      <TableCell label="付款" className="whitespace-nowrap">
        {paymentTag(rental)}
      </TableCell>
      <TableCell label="金額" align="amount" className="whitespace-nowrap font-normal">
        {rental.amount != null ? money(rental.amount) : "—"}
      </TableCell>
      <TableCell label="備註" className="truncate pl-4" title={rental.note || undefined}>
        {rental.note}
      </TableCell>
    </TableRow>
  );
}
