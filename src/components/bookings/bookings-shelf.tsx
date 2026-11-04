"use client";

// 預約冊: a sidebar of folders (period / room / status / clash) next to one
// table of rows, replacing the old plain BookingTable + pagination. Search
// (?q=) stays a GET form above the table; folder selection, row selection,
// the open status menu, and the info panel are all client-only state —
// nothing here is remembered across a reload.
import { useMemo, useState } from "react";
import { conflictInfo, isNextDay, money, paymentTag } from "@/server/logic/home-selectors";
import { shortDateParts } from "@/server/logic/date";
import { DEFAULT_SHELF_FOLDER, folderKey, rivalText, searchShelfRows, shelfCount, shelfRows, SHELF_SECTIONS } from "@/server/logic/shelf";
import type { ShelfFolder } from "@/server/logic/shelf";
import { roomToLabel, statusToLabel } from "@/server/supabase/codecs";
import type { RentalStatusCode, RoomCode } from "@/server/supabase/codecs";
import type { RentalSummary } from "@/server/types/home";
import { BookingActions } from "@/components/bookings/booking-actions";
import { SidebarList } from "@/components/ui/sidebar-list";
import type { SidebarSection } from "@/components/ui/sidebar-list";
import { InfoPanel } from "@/components/ui/info-panel";
import type { InfoPanelPosition } from "@/components/ui/info-panel";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface BookingsShelfProps {
  allRentals: RentalSummary[];
  today: string;
  // Already trimmed by the page; applies on top of whichever folder is selected.
  q: string;
}

const DEFAULT_INFO_POSITION: InfoPanelPosition = { x: 48, y: 44 };

export function BookingsShelf({ allRentals, today, q }: BookingsShelfProps) {
  const [folder, setFolder] = useState<ShelfFolder>(DEFAULT_SHELF_FOLDER);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [infoId, setInfoId] = useState<string | null>(null);
  const [infoPosition, setInfoPosition] = useState<InfoPanelPosition>(DEFAULT_INFO_POSITION);

  const rows = useMemo(
    () => searchShelfRows(shelfRows(allRentals, folder, today), q),
    [allRentals, folder, today, q],
  );

  const sections: SidebarSection[] = useMemo(
    () =>
      SHELF_SECTIONS.map((section) => ({
        title: section.title,
        items: section.items.map((item) => {
          const count = shelfCount(allRentals, item.folder, today);
          return {
            key: folderKey(item.folder),
            label: item.label,
            count,
            active: folderKey(item.folder) === folderKey(folder),
            tone: item.folder.kind === "clash" && count > 0 ? ("danger" as const) : undefined,
            onClick: () => setFolder(item.folder),
          };
        }),
      })),
    [allRentals, folder, today],
  );

  const infoRental = infoId ? rows.find((r) => r.id === infoId) ?? allRentals.find((r) => r.id === infoId) : null;

  function selectRow(id: string) {
    setSelectedId(id);
  }

  function openInfo(id: string) {
    setSelectedId(id);
    setInfoId(id);
    setInfoPosition(DEFAULT_INFO_POSITION);
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
    if (event.key === "Enter" && selectedId) {
      event.preventDefault();
      openInfo(selectedId);
      return;
    }
    if (event.key === "Escape") {
      if (openMenuId) setOpenMenuId(null);
      else if (infoId) setInfoId(null);
    }
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div className="w-44 flex-none border-r border-divider-strong">
        <SidebarList sections={sections} label="預約冊資料夾" />
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col">
        {rows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            {allRentals.length === 0 ? "目前沒有預約" : "找不到符合的預約"}
          </p>
        ) : (
          <TableFrame className="flex-1 pb-0 md:min-h-0 md:flex-1">
            <Table
              stack="md"
              aria-label="預約"
              role="grid"
              tabIndex={0}
              onKeyDown={onGridKeyDown}
              aria-rowcount={rows.length}
            >
              <TableHeader sticky>
                <TableRow className="hover:bg-transparent">
                  <TableHead width="4.5rem">日期</TableHead>
                  <TableHead width="6.5rem">時段</TableHead>
                  <TableHead width="10rem">租借人</TableHead>
                  <TableHead width="4.5rem">教室</TableHead>
                  <TableHead width="4.5rem">用途</TableHead>
                  <TableHead width="6rem">狀態</TableHead>
                  <TableHead width="4.5rem">付款</TableHead>
                  <TableHead align="amount" width="4.5rem">
                    金額
                  </TableHead>
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
                    onOpenInfo={() => openInfo(rental.id)}
                    onContextMenu={(event) => openRowMenu(rental, event)}
                  />
                ))}
              </TableBody>
            </Table>
          </TableFrame>
        )}

        <InfoPanel
          title={infoRental?.person ?? ""}
          open={infoId !== null && infoRental != null}
          position={infoPosition}
          onPositionChange={setInfoPosition}
          onClose={() => setInfoId(null)}
        >
          {infoRental && <BookingInfo rental={infoRental} allRentals={allRentals} />}
        </InfoPanel>
      </div>
    </div>
  );
}

interface BookingRowProps {
  rental: RentalSummary;
  allRentals: RentalSummary[];
  selected: boolean;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onSelect: () => void;
  onOpenInfo: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
}

function BookingRow({
  rental,
  allRentals,
  selected,
  menuOpen,
  onMenuOpenChange,
  onSelect,
  onOpenInfo,
  onContextMenu,
}: BookingRowProps) {
  const clashing = conflictInfo(rental, allRentals) != null;

  return (
    <TableRow
      data-rent={rental.id}
      data-status={rental.status}
      role="row"
      aria-selected={selected}
      className="group cursor-default select-none aria-selected:bg-selected aria-selected:hover:bg-selected"
      onClick={onSelect}
      onDoubleClick={onOpenInfo}
      onContextMenu={onContextMenu}
    >
      <TableCell label="日期" className="tabular-nums whitespace-nowrap">
        {shortDateParts(rental.date).monthDay}
        {clashing && (
          <Tooltip>
            <TooltipTrigger
              render={<span tabIndex={-1} />}
              className="ml-1.5 cursor-default text-xs font-semibold text-destructive"
            >
              撞單
            </TooltipTrigger>
            <TooltipContent>{rivalText(rental, allRentals)}</TooltipContent>
          </Tooltip>
        )}
      </TableCell>
      <TableCell label="時段" className="tabular-nums whitespace-nowrap">
        {rental.start}–{rental.end}
        {isNextDay(rental) && <span className="ml-1 text-xs text-muted-foreground">（跨日）</span>}
      </TableCell>
      <TableCell slot="title" label="租借人" className="min-w-0">
        <div className="max-w-[10rem] truncate font-medium">{rental.person}</div>
        {rental.renterType === "customer" && <div className="text-xs text-muted-foreground">外部客戶</div>}
      </TableCell>
      <TableCell label="教室" className="whitespace-nowrap">
        {roomToLabel(rental.room as RoomCode)}
      </TableCell>
      <TableCell label="用途" className="whitespace-nowrap">
        {rental.purposeLabel}
      </TableCell>
      <TableCell label="狀態" className="whitespace-nowrap">
        <BookingActions rental={rental} allRentals={allRentals} open={menuOpen} onOpenChange={onMenuOpenChange} />
      </TableCell>
      <TableCell label="付款" className="whitespace-nowrap">
        {paymentTag(rental)}
      </TableCell>
      <TableCell label="金額" align="amount" className="whitespace-nowrap">
        {rental.amount != null ? money(rental.amount) : "—"}
      </TableCell>
    </TableRow>
  );
}

function BookingInfo({ rental, allRentals }: { rental: RentalSummary; allRentals: RentalSummary[] }) {
  const clashing = conflictInfo(rental, allRentals) != null;
  return (
    <dl className="space-y-3">
      <InfoField label="狀態">
        {statusToLabel(rental.status as RentalStatusCode)}
        {clashing && <div className="mt-0.5 text-xs text-warn">{rivalText(rental, allRentals)}</div>}
      </InfoField>
      <InfoField label="租借人">{rental.renterType === "roster" ? "名冊" : "外部客戶"}</InfoField>
      <InfoField label="用途">{rental.purposeLabel}</InfoField>
      <InfoField label="付款">{paymentTag(rental)}</InfoField>
      <InfoField label="金額">{rental.amount != null ? money(rental.amount) : "—"}</InfoField>
      <InfoField label="備註">{rental.note || "—"}</InfoField>
    </dl>
  );
}

function InfoField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
