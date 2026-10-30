import { money, roomLabel, slotText } from "@/server/logic/home-selectors";
import { statusToLabel } from "@/server/supabase/codecs";
import type { RentalSummary } from "@/server/types/home";

function rowText(r: RentalSummary): string {
  const amount = r.amount != null ? money(r.amount) : "—";
  return `${slotText(r)} ${r.person} ${roomLabel(r)} · ${amount}（${statusToLabel(r.status)}）`;
}

// C2: the bookings a settings change touches but does not rewrite (unpaid
// amounts after a price change, overlaps after adding a blocked slot). Each
// settings page supplies its own heading.
export function AffectedRentals({
  heading,
  rentals,
}: {
  heading?: string;
  rentals: readonly RentalSummary[];
}) {
  if (rentals.length === 0) return null;

  const soonestFirst = [...rentals].sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  return (
    <div role="status" className="rounded-lg bg-inset p-3 text-sm text-warn space-y-1">
      {heading && <p className="font-medium">{heading}</p>}
      <ul className="max-h-56 overflow-y-auto space-y-0.5">
        {soonestFirst.map((r) => (
          <li key={r.id}>{rowText(r)}</li>
        ))}
      </ul>
    </div>
  );
}
