import type { RentalSummary } from "@/server/types/home";
import { shortDate } from "@/server/logic/date";
import { roomLabel } from "@/server/logic/home-selectors";
import { statusToLabel } from "@/server/supabase/codecs";

export type BatchSummaryRow = {
  id: string;
  dateLabel: string;
  time: string;
  isCrossMidnight: boolean;
  hours: number;
  amount: number;
  statusLabel: string;
};

export type BatchSummary = {
  count: number;
  // The shared status, or null once the rentals have moved apart.
  statusLabel: string | null;
  renter: string;
  roomLabel: string;
  purposeLabel: string;
  paymentLabel: string;
  note: string;
  rows: BatchSummaryRow[];
  totalHours: number;
  totalAmount: number;
};

function hoursBetween(startsAt: string, endsAt: string): number {
  return (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 3_600_000;
}

// S-完成-2..4: the details shown after a submission, built from the rows the
// server actually saved. Everything except the slots is shared by every row
// of a batch, so it's read from the first one.
export function summarizeBatch(rentals: RentalSummary[]): BatchSummary | null {
  if (rentals.length === 0) return null;
  const sorted = [...rentals].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const [first] = sorted;

  const rows = sorted.map((r) => ({
    id: r.id,
    dateLabel: shortDate(r.date),
    time: `${r.start}–${r.end}`,
    isCrossMidnight: r.isCrossMidnight,
    hours: hoursBetween(r.startsAt, r.endsAt),
    amount: r.amount ?? 0,
    statusLabel: statusToLabel(r.status),
  }));
  const statusLabels = new Set(rows.map((r) => r.statusLabel));

  return {
    count: rows.length,
    statusLabel: statusLabels.size === 1 ? rows[0].statusLabel : null,
    renter: first.renterType === "customer" ? `${first.person}（外部客戶）` : first.person,
    roomLabel: roomLabel(first),
    purposeLabel: first.purposeLabel,
    paymentLabel: first.paymentMethod === null ? "無需付款" : first.paymentMethodLabel,
    note: first.note,
    rows,
    totalHours: rows.reduce((sum, r) => sum + r.hours, 0),
    totalAmount: rows.reduce((sum, r) => sum + r.amount, 0),
  };
}
